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
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, user_id, role, restaurant_id } = await req.json();

    if (!user_id || !action) {
      return new Response(JSON.stringify({ error: "user_id e action são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // loja em que a alteração acontece: a informada, ou (telas antigas) a única que o admin administra
    const targetRestaurantId: string | null = restaurant_id || (adminOf.size === 1 ? [...adminOf][0] : null);
    const { data: targetRoles } = await supabaseAdmin
      .from("user_roles")
      .select("restaurant_id, role")
      .eq("user_id", user_id);

    if (!isSuperAdmin) {
      if (!targetRestaurantId || !adminOf.has(targetRestaurantId)) {
        return new Response(JSON.stringify({ error: "Informe a loja da alteração" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const belongsToRestaurant = targetRoles?.some(r => r.restaurant_id === targetRestaurantId);
      if (!belongsToRestaurant) {
        return new Response(JSON.stringify({ error: "Usuário não pertence ao seu restaurante" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // admins, gerentes e supervisores não são editados aqui (o dono cuida deles em Filiais)
      const isTargetAdmin = targetRoles?.some(r => ["admin", "super_admin", "manager", "supervisor"].includes(r.role));
      if (isTargetAdmin) {
        return new Response(JSON.stringify({ error: "Sem permissão para editar este usuário" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Prevent self-deletion
    if (action === "delete" && user_id === caller.id) {
      return new Response(JSON.stringify({ error: "Você não pode excluir a si mesmo" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_role") {
      if (!role) {
        return new Response(JSON.stringify({ error: "Role é obrigatório" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!isSuperAdmin && ["admin", "super_admin", "manager", "supervisor"].includes(role)) {
        return new Response(JSON.stringify({ error: "Sem permissão para atribuir esta função" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabaseAdmin
        .from("user_roles")
        .update({ role })
        .eq("user_id", user_id)
        .eq("restaurant_id", targetRestaurantId);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      // Tira a pessoa desta loja; a conta só é apagada se ela não trabalhar em outra loja da rede.
      if (!isSuperAdmin || targetRestaurantId) {
        await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id).eq("restaurant_id", targetRestaurantId);
        await supabaseAdmin.from("user_active_restaurant").delete().eq("user_id", user_id).eq("restaurant_id", targetRestaurantId);
        const stillWorks = (targetRoles ?? []).some(r => r.restaurant_id !== targetRestaurantId);
        // quem também é cliente de alguma loja continua com a conta (só sai da equipe)
        const { data: who } = await supabaseAdmin.auth.admin.getUserById(user_id);
        const { data: found } = who?.user?.email ? await supabaseAdmin.rpc("auth_user_by_email", { _email: who.user.email }) : { data: null };
        const isCustomer = Array.isArray(found) && found[0]?.is_customer;
        if (stillWorks || isCustomer) {
          return new Response(JSON.stringify({ success: true }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id);
      }

      const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
