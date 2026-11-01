export const metrics = [
  { id: 'outTemp', label: 'Venkovní teplota', unit: '°C', digits: 1 },
  { id: 'outHumidity', label: 'Vlhkost vzduchu', unit: '%', digits: 0 },
  { id: 'barometer', label: 'Tlak vzduchu', unit: 'hPa', digits: 1 },
  { id: 'windSpeed', label: 'Rychlost větru', unit: 'm/s', digits: 1 },
  { id: 'windGust', label: 'Náraz větru', unit: 'm/s', digits: 1 },
  { id: 'rainRate', label: 'Intenzita srážek', unit: 'mm/h', digits: 1 },
  { id: 'rain', label: 'Srážky za archivní interval', unit: 'mm', digits: 1 },
  { id: 'radiation', label: 'Sluneční záření', unit: 'W/m²', digits: 0 },
  { id: 'UV', label: 'UV index', unit: '', digits: 1 },
  { id: 'pm25_1', label: 'PM2,5', unit: 'µg/m³', digits: 1 }
] as const;

export type KnownMetric = (typeof metrics)[number]['id'];
export const getMetric = (id: string) => metrics.find((item) => item.id === id);
export const formatValue = (value: number | null | undefined, digits = 1): string =>
  typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
    : '—';
