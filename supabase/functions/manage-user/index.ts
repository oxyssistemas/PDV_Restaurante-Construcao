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

    // Verify target user belongs to caller's restaurant
    if (isAdmin && !isSuperAdmin) {
      const { data: targetRoles } = await supabaseAdmin
        .from("user_roles")
        .select("restaurant_id, role")
        .eq("user_id", user_id);

      const belongsToRestaurant = targetRoles?.some(r => r.restaurant_id === callerRestaurantId);
      if (!belongsToRestaurant) {
        return new Response(JSON.stringify({ error: "Usuário não pertence ao seu restaurante" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Can't edit admins or super_admins
      const isTargetAdmin = targetRoles?.some(r => r.role === "admin" || r.role === "super_admin");
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

      if (isAdmin && !isSuperAdmin && (role === "admin" || role === "super_admin")) {
        return new Response(JSON.stringify({ error: "Sem permissão para atribuir esta função" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const targetRestaurantId = restaurant_id || callerRestaurantId;

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
      // Delete role first, then user
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", user_id);

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
