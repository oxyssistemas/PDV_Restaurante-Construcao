export const reservationStatusLabels: Record<string, string> = {
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  completed: 'Concluída',
  no_show: 'Não compareceu',
};

export interface ReservationLike {
  id: string;
  table_id: string;
  customer_name: string;
  reservation_date: string;
  start_time: string;
  end_time: string;
  status: string;
}

/** Tolerância (min) antes do horário em que a mesa já fica bloqueada para o titular. */
export const RESERVATION_HOLD_MINUTES = 30;

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const minutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Reserva confirmada que está segurando a mesa neste momento (mesma regra do banco). */
export function activeReservationFor(
  tableId: string,
  reservations: ReservationLike[] | undefined,
  now = new Date()
): ReservationLike | null {
  const today = todayISO();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return (
    (reservations || []).find(
      r =>
        r.table_id === tableId &&
        r.status === 'confirmed' &&
        r.reservation_date === today &&
        minutes(r.start_time) - RESERVATION_HOLD_MINUTES <= nowMin &&
        minutes(r.end_time) >= nowMin
    ) || null
  );
}

export function upcomingReservationFor(
  tableId: string,
  reservations: ReservationLike[] | undefined,
  now = new Date()
): ReservationLike | null {
  const today = todayISO();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return (
    (reservations || [])
      .filter(
        r =>
          r.table_id === tableId &&
          r.status === 'confirmed' &&
          r.reservation_date === today &&
          minutes(r.start_time) - RESERVATION_HOLD_MINUTES > nowMin
      )
      .sort((a, b) => minutes(a.start_time) - minutes(b.start_time))[0] || null
  );
}

export const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : '--:--');

export const sameHolder = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
