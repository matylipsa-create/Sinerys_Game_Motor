export type CameraPerspective = 'first_person_doom' | 'isometric_tactical' | 'cinematic_rail' | 'side_scroll_action';

export interface CameraConfig {
  perspective: CameraPerspective;
  fov: number;
  smoothness: number;
  shakeIntensity: number;
}

export class DynamicCameraManager {
  public currentConfig: CameraConfig = {
    perspective: 'first_person_doom',
    fov: 95,
    smoothness: 0.05,
    shakeIntensity: 0,
  };

  public switchPerspective(newPerspective: CameraPerspective): void {
    this.currentConfig.perspective = newPerspective;
    this.currentConfig.fov = newPerspective === 'isometric_tactical'
      ? 45
      : newPerspective === 'cinematic_rail' ? 60 : 95;
  }

  public triggerImpactShake(intensity: number): void {
    this.currentConfig.shakeIntensity = intensity;
  }
}