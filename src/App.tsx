import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/contexts/BrandingContext";

import Login from "./pages/Login";
import Setup from "./pages/Setup";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

import ProtectedRoute from "./components/ProtectedRoute";
import RoleGate from "./components/RoleGate";
import PermissionsPage from "./pages/admin/Permissions";
import DocumentTitle from "./components/DocumentTitle";
import SuperAdminLayout from "./components/layouts/SuperAdminLayout";
import SuperAdminDashboard from "./pages/super-admin/Dashboard";
import Restaurants from "./pages/super-admin/Restaurants";

import AdminLayout from "./components/layouts/AdminLayout";
import AdminDashboard from "./pages/admin/Dashboard";
import MenuPage from "./pages/admin/Menu";
import TablesPage from "./pages/admin/Tables";
import InventoryPage from "./pages/admin/Inventory";
import UsersPage from "./pages/admin/Users";
import SettingsPage from "./pages/admin/Settings";
import CrmPage from "./pages/admin/Crm";
import FinanceCrmPage from "./pages/finance/FinanceCrm";

import WaiterLayout from "./components/layouts/WaiterLayout";
import TableMap from "./pages/waiter/TableMap";
import WaiterOrders from "./pages/waiter/Orders";
import OrderDetail from "./pages/waiter/OrderDetail";
import WaiterMenu from "./pages/waiter/WaiterMenu";
import WaiterReservations from "./pages/waiter/Reservations";

import KitchenLayout from "./components/layouts/KitchenLayout";
import KitchenQueue from "./pages/kitchen/KitchenQueue";

import CashierLayout from "./components/layouts/CashierLayout";
import CashRegisterPage from "./pages/cashier/CashRegister";
import PaymentsPage from "./pages/cashier/Payments";
import CashMovementsPage from "./pages/cashier/CashMovements";
import CashierNewOrder from "./pages/cashier/NewOrder";

import FinanceLayout from "./components/layouts/FinanceLayout";
import FinanceDashboard from "./pages/finance/Dashboard";
import FinanceReports from "./pages/finance/Reports";
import FinanceInventory from "./pages/finance/Inventory";

import DeliveryLayout from "./components/layouts/DeliveryLayout";
import DeliveryOrders from "./pages/delivery/DeliveryOrders";
import NewDelivery from "./pages/delivery/NewDelivery";

import CourierLayout from "./components/layouts/CourierLayout";
import MyDeliveries from "./pages/courier/MyDeliveries";
import CouriersPage from "./pages/admin/Couriers";
import OrdersHistory from "./pages/shared/OrdersHistory";

import HrPage from "./pages/shared/HrPage";
import DrePage from "./pages/shared/DrePage";
import LoyaltyPage from "./pages/shared/LoyaltyPage";
import BrandingPage from "./pages/shared/BrandingPage";
import AssistantPage from "./pages/shared/AssistantPage";
import PlansPage from "./pages/super-admin/Plans";
import MarketingLayout from "./components/layouts/MarketingLayout";
import MarketingOverview from "./pages/marketing/Overview";
import MarketingConnections from "./pages/marketing/Connections";
import MarketingCampaigns from "./pages/marketing/Campaigns";




const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <BrandingProvider>
          <DocumentTitle />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/" element={<Index />} />

            {/* Super Admin */}
            <Route path="/super-admin" element={
              <ProtectedRoute allowedRoles={['super_admin']}>
                <SuperAdminLayout />
              </ProtectedRoute>
            }>
              <Route index element={<SuperAdminDashboard />} />
              <Route path="restaurants" element={<Restaurants />} />
              <Route path="plans" element={<PlansPage />} />
            </Route>

            {/* Admin do Restaurante */}
            <Route path="/admin" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminLayout />
              </ProtectedRoute>
            }>
              <Route index element={<AdminDashboard />} />
              <Route path="crm" element={<CrmPage />} />
              <Route path="menu" element={<MenuPage />} />
              <Route path="tables" element={<TablesPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="couriers" element={<CouriersPage />} />
              <Route path="history" element={<OrdersHistory />} />
              <Route path="hr" element={<HrPage />} />
              <Route path="dre" element={<DrePage />} />
              <Route path="loyalty" element={<LoyaltyPage />} />
              <Route path="branding" element={<BrandingPage />} />
              <Route path="assistant" element={<AssistantPage />} />

              <Route path="settings" element={<SettingsPage />} />
            </Route>

            {/* Marketing */}
            <Route path="/marketing" element={
              <ProtectedRoute allowedRoles={['marketing', 'admin']}>
                <MarketingLayout />
              </ProtectedRoute>
            }>
              <Route index element={<MarketingOverview />} />
              <Route path="connections" element={<MarketingConnections />} />
              <Route path="campaigns" element={<MarketingCampaigns />} />
            </Route>


            {/* Placeholder routes for other portals */}
            <Route path="/waiter" element={
              <ProtectedRoute allowedRoles={['waiter']}>
                <WaiterLayout />
              </ProtectedRoute>
            }>
              <Route index element={<TableMap />} />
              <Route path="orders" element={<WaiterOrders />} />
              <Route path="orders/:orderId" element={<OrderDetail />} />
              <Route path="menu" element={<WaiterMenu />} />
              <Route path="reservations" element={<WaiterReservations />} />
            </Route>
            <Route path="/kitchen" element={
              <ProtectedRoute allowedRoles={['kitchen']}>
                <KitchenLayout />
              </ProtectedRoute>
            }>
              <Route index element={<KitchenQueue />} />
            </Route>
            <Route path="/cashier" element={
              <ProtectedRoute allowedRoles={['cashier']}>
                <CashierLayout />
              </ProtectedRoute>
            }>
              <Route index element={<CashRegisterPage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="orders" element={<CashierNewOrder />} />
              <Route path="movements" element={<CashMovementsPage />} />
            </Route>
            <Route path="/finance" element={
              <ProtectedRoute allowedRoles={['finance', 'hr']}>
                <FinanceLayout />
              </ProtectedRoute>
            }>
              <Route index element={<RoleGate roles={['finance']}><FinanceDashboard /></RoleGate>} />
              <Route path="crm" element={<RoleGate roles={['finance']}><FinanceCrmPage /></RoleGate>} />
              <Route path="reports" element={<RoleGate roles={['finance']}><FinanceReports /></RoleGate>} />
              <Route path="inventory" element={<RoleGate roles={['finance']}><FinanceInventory /></RoleGate>} />
              <Route path="history" element={<RoleGate roles={['finance']}><OrdersHistory /></RoleGate>} />
              <Route path="hr" element={<HrPage />} />
              <Route path="dre" element={<DrePage />} />
              <Route path="loyalty" element={<LoyaltyPage />} />

            </Route>
            <Route path="/delivery" element={
              <ProtectedRoute allowedRoles={['delivery', 'admin']}>
                <DeliveryLayout />
              </ProtectedRoute>
            }>
              <Route index element={<DeliveryOrders />} />
              <Route path="new" element={<NewDelivery />} />
            </Route>
            <Route path="/courier" element={
              <ProtectedRoute allowedRoles={['courier']}>
                <CourierLayout />
              </ProtectedRoute>
            }>
              <Route index element={<MyDeliveries />} />
            </Route>


            <Route path="*" element={<NotFound />} />
          </Routes>
          </BrandingProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);


export default App;
