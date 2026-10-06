import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/contexts/BrandingContext";

import Login from "./pages/Login";
import Setup from "./pages/Setup";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import TableMenu from "./pages/public/TableMenu";

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
import BranchesPage from "./pages/admin/Branches";
import NetworkPage from "./pages/admin/Network";
import FinanceCmvPage from './pages/finance/Cmv';
import ReviewsPage from './pages/shared/ReviewsPage';
import AccountantPage from './pages/shared/AccountantPage';
import FiscalPage from './pages/shared/FiscalPage';
import ModuleGate from "./components/ModuleGate";
import StockCountsPage from "./pages/shared/StockCounts";
import StockCountDetailPage from "./pages/shared/StockCountDetail";
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
import StoreSettings from "./pages/delivery/StoreSettings";
import WhatsAppBot from "./pages/delivery/WhatsAppBot";
import OnlineStore from "./pages/public/OnlineStore";
import OrderTracking from "./pages/public/OrderTracking";
import ReviewOrder from "./pages/public/ReviewOrder";
import Kiosk from "./pages/public/Kiosk";
import KiosksPage from "./pages/admin/Kiosks";
import MarketplacesPage from "./pages/admin/Marketplaces";
import DeliveryHub, { DeliveryOverview } from "./pages/admin/DeliveryHub";

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
import IfoodPage from "./pages/shared/IfoodPage";
import MarketingOverview from "./pages/marketing/Overview";
import MarketingConnections from "./pages/marketing/Connections";
import MarketingPublish from "./pages/marketing/Publish";
import Privacy from "./pages/legal/Privacy";
import PrintStation from "./pages/PrintStation";
import PrintStationRunner from "./components/print/PrintStationRunner";
import NativeShell from "./components/NativeShell";
import OfflineBanner from "./components/OfflineBanner";
import DedicatedGate from "./components/DedicatedGate";
import Terms from "./pages/legal/Terms";
import MarketingPosts from "./pages/marketing/Posts";
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
          <PrintStationRunner />
          <NativeShell />
          <OfflineBanner />
          <DedicatedGate>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/" element={<Index />} />
            <Route path="/mesa/:token" element={<TableMenu />} />
            <Route path="/pedir/:slug" element={<OnlineStore />} />
            <Route path="/pedir/:slug/pedido/:orderId" element={<OrderTracking />} />
            <Route path="/avaliar/:token" element={<ReviewOrder />} />
            <Route path="/totem/:token" element={<Kiosk />} />
            <Route path="/privacidade" element={<Privacy />} />
            <Route path="/termos" element={<Terms />} />
            <Route path="/impressao" element={<ProtectedRoute><PrintStation /></ProtectedRoute>} />

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
              <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
                <AdminLayout />
              </ProtectedRoute>
            }>
              <Route index element={<ModuleGate module="dashboard"><AdminDashboard /></ModuleGate>} />
              <Route path="crm" element={<ModuleGate module="crm"><CrmPage /></ModuleGate>} />
              <Route path="menu" element={<ModuleGate module="menu"><MenuPage /></ModuleGate>} />
              <Route path="tables" element={<ModuleGate module="tables"><TablesPage /></ModuleGate>} />
              <Route path="inventory" element={<ModuleGate module="inventory"><InventoryPage /></ModuleGate>} />
              <Route path="users" element={<ModuleGate module="users"><UsersPage /></ModuleGate>} />
              <Route path="branches" element={<ModuleGate module="branches"><BranchesPage /></ModuleGate>} />
              <Route path="network" element={<ModuleGate module="network"><NetworkPage /></ModuleGate>} />
              <Route path="stock-counts" element={<ModuleGate module="stock_counts"><StockCountsPage /></ModuleGate>} />
              <Route path="stock-counts/:id" element={<ModuleGate module="stock_counts"><StockCountDetailPage /></ModuleGate>} />
              <Route path="reviews" element={<ModuleGate module="reviews"><ReviewsPage /></ModuleGate>} />
              <Route path="accountant" element={<ModuleGate module="accountant"><AccountantPage /></ModuleGate>} />
              <Route path="kiosks" element={<ModuleGate module="kiosks"><KiosksPage /></ModuleGate>} />
              <Route path="permissions" element={<RoleGate roles={['admin']}><PermissionsPage /></RoleGate>} />
              <Route path="history" element={<ModuleGate module="history"><OrdersHistory /></ModuleGate>} />
              <Route path="hr" element={<ModuleGate module="hr"><HrPage /></ModuleGate>} />
              <Route path="dre" element={<ModuleGate module="dre"><DrePage /></ModuleGate>} />
              <Route path="loyalty" element={<ModuleGate module="loyalty"><LoyaltyPage /></ModuleGate>} />
              <Route path="branding" element={<ModuleGate module="branding"><BrandingPage /></ModuleGate>} />
              <Route path="assistant" element={<ModuleGate module="ai"><AssistantPage /></ModuleGate>} />

              <Route path="delivery" element={<DeliveryHub />}>
                <Route index element={<ModuleGate module="delivery"><DeliveryOverview /></ModuleGate>} />
                <Route path="pedidos" element={<ModuleGate module="delivery"><DeliveryOrders readOnly /></ModuleGate>} />
                <Route path="loja" element={<ModuleGate module="online_store"><StoreSettings /></ModuleGate>} />
                <Route path="whatsapp" element={<ModuleGate module="whatsapp"><WhatsAppBot /></ModuleGate>} />
                <Route path="ifood" element={<ModuleGate module="ifood"><IfoodPage /></ModuleGate>} />
                <Route path="99food" element={<ModuleGate module="marketplaces"><MarketplacesPage only="99food" /></ModuleGate>} />
                <Route path="keeta" element={<ModuleGate module="marketplaces"><MarketplacesPage only="keeta" /></ModuleGate>} />
                <Route path="rappi" element={<ModuleGate module="marketplaces"><MarketplacesPage only="rappi" /></ModuleGate>} />
                <Route path="entregadores" element={<ModuleGate module="couriers"><CouriersPage /></ModuleGate>} />
              </Route>
              {/* endereços antigos */}
              <Route path="ifood" element={<Navigate to="/admin/delivery/ifood" replace />} />
              <Route path="couriers" element={<Navigate to="/admin/delivery/entregadores" replace />} />
              <Route path="marketplaces" element={<Navigate to="/admin/delivery" replace />} />
              <Route path="online-store" element={<Navigate to="/admin/delivery/loja" replace />} />
              <Route path="whatsapp" element={<Navigate to="/admin/delivery/whatsapp" replace />} />
              <Route path="fiscal" element={<ModuleGate module="fiscal"><FiscalPage /></ModuleGate>} />
              <Route path="settings" element={<ModuleGate module="settings"><SettingsPage /></ModuleGate>} />
            </Route>

            {/* Marketing */}
            <Route path="/marketing" element={
              <ProtectedRoute allowedRoles={['marketing', 'admin']}>
                <MarketingLayout />
              </ProtectedRoute>
            }>
              <Route index element={<MarketingOverview />} />
              <Route path="publish" element={<MarketingPublish />} />
              <Route path="posts" element={<MarketingPosts />} />
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
              <Route path="delivery" element={<ModuleGate module="delivery"><DeliveryOrders newOrderPath="/cashier/delivery/new" /></ModuleGate>} />
              <Route path="delivery/new" element={<ModuleGate module="delivery"><NewDelivery /></ModuleGate>} />
              <Route path="movements" element={<CashMovementsPage />} />
            </Route>
            <Route path="/finance" element={
              <ProtectedRoute allowedRoles={['finance', 'hr']}>
                <FinanceLayout />
              </ProtectedRoute>
            }>
              <Route index element={<ModuleGate module="dashboard"><FinanceDashboard /></ModuleGate>} />
              <Route path="crm" element={<ModuleGate module="crm"><FinanceCrmPage /></ModuleGate>} />
              <Route path="reports" element={<ModuleGate module="reports"><FinanceReports /></ModuleGate>} />
              <Route path="inventory" element={<ModuleGate module="inventory"><FinanceInventory /></ModuleGate>} />
              <Route path="history" element={<ModuleGate module="history"><OrdersHistory /></ModuleGate>} />
              <Route path="stock-counts" element={<ModuleGate module="stock_counts"><StockCountsPage /></ModuleGate>} />
              <Route path="stock-counts/:id" element={<ModuleGate module="stock_counts"><StockCountDetailPage /></ModuleGate>} />
              <Route path="cmv" element={<ModuleGate module="cmv"><FinanceCmvPage /></ModuleGate>} />
              <Route path="reviews" element={<ModuleGate module="reviews"><ReviewsPage /></ModuleGate>} />
              <Route path="accountant" element={<ModuleGate module="accountant"><AccountantPage /></ModuleGate>} />
              <Route path="fiscal" element={<ModuleGate module="fiscal"><FiscalPage /></ModuleGate>} />
              <Route path="hr" element={<ModuleGate module="hr"><HrPage /></ModuleGate>} />
              <Route path="dre" element={<ModuleGate module="dre"><DrePage /></ModuleGate>} />
              <Route path="loyalty" element={<ModuleGate module="loyalty"><LoyaltyPage /></ModuleGate>} />

            </Route>
            <Route path="/delivery" element={
              <ProtectedRoute allowedRoles={['delivery']}>
                <DeliveryLayout />
              </ProtectedRoute>
            }>
              <Route index element={<ModuleGate module="delivery"><DeliveryOrders /></ModuleGate>} />
              <Route path="new" element={<ModuleGate module="delivery"><NewDelivery /></ModuleGate>} />
              <Route path="ifood" element={<ModuleGate module="ifood"><IfoodPage /></ModuleGate>} />
              <Route path="loja" element={<ModuleGate module="online_store"><StoreSettings /></ModuleGate>} />
              <Route path="whatsapp" element={<ModuleGate module="whatsapp"><WhatsAppBot /></ModuleGate>} />
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
          </DedicatedGate>
          </BrandingProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);


export default App;
