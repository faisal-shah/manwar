import { prayerLayer } from '../app/face';
import { startAudioController } from './audio';
import { startStage } from './stage';
import { loadMedia, startWeather } from './store';
import { PrayerLayer } from './ui/Face';

/** The prayer clock on the wall: media, weather, the athan, the rules between the faces, and its layer. */
export function startPrayer(): void {
  void loadMedia();
  startWeather();
  startAudioController();
  startStage();
  prayerLayer.value = PrayerLayer;
}
