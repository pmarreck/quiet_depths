import {missions} from './mission-catalog.ts';

// The Elm mission definition owns these values. Photo credit and each
// patrol's seeded goal read the same generated record.
export interface PhotoCriteria {
  framingDegrees: number;
  fewestPhotos: number;
  goalSpread: number;
}

export const photoCriteria: PhotoCriteria = missions.find(m => m.id === 'recon')!.objective;

export function photoGoal(roll: number, c: PhotoCriteria): number {
  return c.fewestPhotos + Math.floor(roll * c.goalSpread);
}

export const framed = (offsetDegrees: number, c: PhotoCriteria) => Math.abs(offsetDegrees) < c.framingDegrees;
