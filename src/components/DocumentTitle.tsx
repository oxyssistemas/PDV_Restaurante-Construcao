import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const BRAND = "Oxys Restaurante";

const TITLES: { match: RegExp; title: string }[] = [
  { match: /^\/login/, title: "Login" },
  { match: /^\/setup/, title: "Configuração inicial" },
  { match: /^\/super-admin\/restaurants/, title: "Restaurantes" },
  { match: /^\/super-admin/, title: "Painel Super Admin" },
  { match: /^\/admin\/menu/, title: "Cardápio" },
  { match: /^\/admin\/tables/, title: "Mesas" },
  { match: /^\/admin\/inventory/, title: "Estoque" },
  { match: /^\/admin\/users/, title: "Usuários" },
  { match: /^\/admin\/settings/, title: "Configurações" },
  { match: /^\/admin/, title: "Painel do Restaurante" },
  { match: /^\/waiter\/orders\//, title: "Comanda" },
  { match: /^\/waiter\/orders/, title: "Pedidos" },
  { match: /^\/waiter\/menu/, title: "Cardápio" },
  { match: /^\/waiter\/reservations/, title: "Reservas" },
  { match: /^\/waiter/, title: "Mapa de Mesas" },
  { match: /^\/kitchen/, title: "Cozinha" },
  { match: /^\/cashier\/payments/, title: "Pagamentos" },
  { match: /^\/cashier\/orders/, title: "Lançar Pedido" },
  { match: /^\/cashier\/movements/, title: "Movimentações" },
  { match: /^\/cashier/, title: "Caixa" },
  { match: /^\/finance\/reports/, title: "Relatórios" },
  { match: /^\/finance\/inventory/, title: "Estoque" },
  { match: /^\/finance/, title: "Financeiro" },
  { match: /^\/delivery\/new/, title: "Novo Pedido Delivery" },
  { match: /^\/delivery/, title: "Delivery" },
  { match: /^\/$/, title: "Sistema PDV para Restaurantes" },

];

const DocumentTitle = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    const entry = TITLES.find((t) => t.match.test(pathname));
    document.title = entry ? `${entry.title} — ${BRAND}` : `${BRAND}`;
  }, [pathname]);

  return null;
};

export default DocumentTitle;
