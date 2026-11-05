// Explicit product decision for 1.6.0. Costume categories are unchanged.
export const includeReferencePose = pose => pose.sys !== '双人缠绵' && !String(pose.id).startsWith('pair60_');
