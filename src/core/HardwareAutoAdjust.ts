import { DeviceCapabilities } from './DeviceManager';
import { PowerMode } from './PowerManager';

export interface HardwareProfile {
  tier: 'low' | 'medium' | 'high' | 'desktop';
  label: string;
  powerMode: PowerMode;
  perceptionModel: 'lite_mobilenet_v2' | 'mobilenet_v2' | 'none';
  maxFps: number;
  enablePerception: boolean;
  enableGPS: boolean;
  enableIMU: boolean;
  enableAudio: boolean;
  enableBackgroundSync: boolean;
  sensorIntervalMs: number;
  perceptionIntervalMs: number;
  enableBio: boolean;
  bioSessionDuration: number;
}

export class HardwareAutoAdjust {
  detectTier(caps: DeviceCapabilities): 'low' | 'medium' | 'high' | 'desktop' {
    if (caps.platform === 'desktop') return 'desktop';

    const score =
      (caps.memory >= 4 ? 2 : caps.memory >= 2 ? 1 : 0) +
      (caps.cores >= 4 ? 2 : caps.cores >= 2 ? 1 : 0) +
      (caps.hasCamera ? 1 : 0) +
      (caps.hasAccelerometer ? 1 : 0) +
      (caps.hasBluetooth ? 1 : 0);

    if (caps.platform === 'mobile' && caps.memory <= 2) return 'low';
    if (score >= 5) return 'high';
    if (score >= 3) return 'medium';
    return 'low';
  }

  getProfile(caps: DeviceCapabilities): HardwareProfile {
    const tier = this.detectTier(caps);

    switch (tier) {
      case 'desktop':
        return {
          tier: 'desktop',
          label: 'PC - Maximo rendimiento',
          powerMode: 'alto_rendimiento',
          perceptionModel: 'mobilenet_v2',
          maxFps: 30,
          enablePerception: true,
          enableGPS: false,
          enableIMU: false,
          enableAudio: true,
          enableBackgroundSync: true,
          sensorIntervalMs: 500,
          perceptionIntervalMs: 1000,
          enableBio: true,
          bioSessionDuration: 300,
        };
      case 'high':
        return {
          tier: 'high',
          label: 'Celular alto - COCO-SSD completo',
          powerMode: 'alto_rendimiento',
          perceptionModel: 'mobilenet_v2',
          maxFps: 30,
          enablePerception: true,
          enableGPS: true,
          enableIMU: true,
          enableAudio: true,
          enableBackgroundSync: true,
          sensorIntervalMs: 1000,
          perceptionIntervalMs: 1000,
          enableBio: true,
          bioSessionDuration: 300,
        };
      case 'medium':
        return {
          tier: 'medium',
          label: 'Celular medio - COCO-SSD lite',
          powerMode: 'normal',
          perceptionModel: 'lite_mobilenet_v2',
          maxFps: 15,
          enablePerception: true,
          enableGPS: true,
          enableIMU: true,
          enableAudio: true,
          enableBackgroundSync: true,
          sensorIntervalMs: 3000,
          perceptionIntervalMs: 5000,
          enableBio: true,
          bioSessionDuration: 240,
        };
      case 'low':
      default:
        return {
          tier: 'low',
          label: 'Celular bajo - Ultra ahorro',
          powerMode: 'ultra_ahorro',
          perceptionModel: 'none',
          maxFps: 5,
          enablePerception: false,
          enableGPS: false,
          enableIMU: true,
          enableAudio: false,
          enableBackgroundSync: false,
          sensorIntervalMs: 10000,
          perceptionIntervalMs: 0,
          enableBio: true,
          bioSessionDuration: 180,
        };
    }
  }

  adjust(caps: DeviceCapabilities): HardwareProfile {
    return this.getProfile(caps);
  }
}

export const hardwareAutoAdjust = new HardwareAutoAdjust();
