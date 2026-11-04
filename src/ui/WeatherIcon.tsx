import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
} from 'lucide-preact';
import { weatherKind } from '../core/weather';

const SUN = '#F2A33A';
const GREY = '#8a96a0';
const BLUE = '#5b8fc7';

/** Weather glyph for a WMO code, colored like Skylight's (orange sun, grey cloud, blue rain). */
export function WeatherIcon({ code, size = 2.4, night }: { code: number; size?: number; night?: boolean }) {
  const kind = weatherKind(code);
  const px = `${size}rem`;
  const p = { width: px, height: px, strokeWidth: 2 };
  switch (kind) {
    case 'clear':
      return night ? <Moon {...p} color={GREY} /> : <Sun {...p} color={SUN} />;
    case 'partly':
      return night ? <CloudMoon {...p} color={GREY} /> : <CloudSun {...p} color={SUN} />;
    case 'cloudy':
      return <Cloud {...p} color={GREY} />;
    case 'fog':
      return <CloudFog {...p} color={GREY} />;
    case 'drizzle':
      return <CloudDrizzle {...p} color={BLUE} />;
    case 'rain':
      return <CloudRain {...p} color={BLUE} />;
    case 'snow':
      return <CloudSnow {...p} color={BLUE} />;
    default:
      return <CloudLightning {...p} color={BLUE} />;
  }
}
