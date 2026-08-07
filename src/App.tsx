import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";

import Login from "./pages/Login";
import Setup from "./pages/Setup";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

import ProtectedRoute from "./components/ProtectedRoute";
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


const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
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
            </Route>

            {/* Admin do Restaurante */}
            <Route path="/admin" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminLayout />
              </ProtectedRoute>
            }>
              <Route index element={<AdminDashboard />} />
              <Route path="menu" element={<MenuPage />} />
              <Route path="tables" element={<TablesPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="settings" element={<SettingsPage />} />
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
              <ProtectedRoute allowedRoles={['finance']}>
                <FinanceLayout />
              </ProtectedRoute>
            }>
              <Route index element={<FinanceDashboard />} />
              <Route path="reports" element={<FinanceReports />} />
              <Route path="inventory" element={<FinanceInventory />} />
            </Route>
            <Route path="/delivery" element={
              <ProtectedRoute allowedRoles={['delivery', 'admin']}>
                <DeliveryLayout />
              </ProtectedRoute>
            }>
              <Route index element={<DeliveryOrders />} />
              <Route path="new" element={<NewDelivery />} />
            </Route>


            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);


export default App;
