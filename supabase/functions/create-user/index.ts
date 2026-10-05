import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify caller
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
    
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role, restaurant_id")
      .eq("user_id", caller.id);

    // Admin, gerente e supervisor administram a equipe das lojas em que têm esse cargo (filiais: cada uma a sua).
    const ADMIN_LIKE = ["admin", "manager", "supervisor"];
    const isSuperAdmin = callerRoles?.some(r => r.role === "super_admin");
    const adminOf = new Set((callerRoles ?? []).filter(r => ADMIN_LIKE.includes(r.role)).map(r => r.restaurant_id));

    if (!isSuperAdmin && !adminOf.size) {
      return new Response(JSON.stringify({ error: "Apenas super admins e admins podem criar usuários" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, role, restaurant_id } = await req.json();

    if (!email || !password || !role) {
      return new Response(JSON.stringify({ error: "Email, senha e role são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isSuperAdmin) {
      // admins/gerentes/supervisores não criam admins, gerentes nem supervisores (isso é do dono, em Filiais)
      if (["super_admin", "admin", "manager", "supervisor"].includes(role)) {
        return new Response(JSON.stringify({ error: "Admins não podem criar outros admins, gerentes ou supervisores" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!restaurant_id || !adminOf.has(restaurant_id)) {
        return new Response(JSON.stringify({ error: "Você só pode criar usuários para o seu restaurante" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Create user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    let userId = newUser?.user?.id as string | undefined;
    let existing = false;
    if (createError) {
      // Email que já tem conta (cliente da loja online ou funcionário de outra loja): usa a mesma conta.
      // A senha não muda — a pessoa entra com a senha que já usa (ou "Esqueci minha senha").
      const { data: found } = await supabaseAdmin.rpc("auth_user_by_email", { _email: email });
      const acc = Array.isArray(found) ? found[0] : null;
      if (!acc || !/already|registered|exists/i.test(createError.message)) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (acc.is_super) {
        return new Response(JSON.stringify({ error: "Este email não pode ser usado na equipe." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // conta de outra empresa não é puxada (só clientes ou alguém da própria rede)
      if (!isSuperAdmin && (acc.roles ?? []).some((r: string) => !adminOf.has(r.split(":")[1]))) {
        return new Response(JSON.stringify({ error: "Este email já pertence à equipe de outra loja. Use outro email." }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if ((acc.roles ?? []).some((r: string) => r.endsWith(`:${restaurant_id ?? ""}`))) {
        return new Response(JSON.stringify({ error: "Esta pessoa já faz parte da equipe desta loja." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = acc.id;
      existing = true;
    }

    // Assign role
    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      role,
      restaurant_id: restaurant_id || null,
    });

    if (roleError) {
      return new Response(JSON.stringify({ error: roleError.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (existing) {
      return new Response(JSON.stringify({
        user: { id: userId, email }, existing: true,
        message: "Este email já tinha conta (cliente ou outra loja). A pessoa entra com a senha que já usa; a senha digitada aqui não foi aplicada.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ user: newUser.user }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
