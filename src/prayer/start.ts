import { prayerLayer } from '../app/face';
import { startAudioController } from './audio';
import { startStage } from './stage';
import { loadMedia } from './store';
import { PrayerLayer } from './ui/Face';

/** The prayer clock on the wall: media, the athan, the rules between the faces, and its layer (the weather is the wall's: core/weather.ts). */
export function startPrayer(): void {
  void loadMedia();
  startAudioController();
  startStage();
  prayerLayer.value = PrayerLayer;
}
