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

    const isSuperAdmin = callerRoles?.some(r => r.role === "super_admin");
    const isAdmin = callerRoles?.some(r => r.role === "admin");
    const callerRestaurantId = callerRoles?.find(r => r.role === "admin")?.restaurant_id;

    if (!isSuperAdmin && !isAdmin) {
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

    // Admins can only create non-admin/non-super_admin roles for their own restaurant
    if (isAdmin && !isSuperAdmin) {
      if (role === "super_admin" || role === "admin") {
        return new Response(JSON.stringify({ error: "Admins não podem criar outros admins ou super admins" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (restaurant_id !== callerRestaurantId) {
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

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Assign role
    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: newUser.user.id,
      role,
      restaurant_id: restaurant_id || null,
    });

    if (roleError) {
      return new Response(JSON.stringify({ error: roleError.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
