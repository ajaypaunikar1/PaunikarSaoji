export const getISTDateKey = (iso?: string | Date | null): string => {
  const d = iso ? new Date(iso) : new Date();
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
};

export const getISTHour = (iso?: string | Date | null): number => {
  const d = iso ? new Date(iso) : new Date();
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    hour12: false
  }).format(d);
  const hour = parseInt(hourStr, 10);
  if (Number.isNaN(hour)) return 0;
  return hour === 24 ? 0 : hour;
};
