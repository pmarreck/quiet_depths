// Each typed module declares the slice of patrol state it reads. Until the
// simulation shares one world type, a hand-off between slices passes through here.
export const slice = <T>(value: object) => value as unknown as T;
