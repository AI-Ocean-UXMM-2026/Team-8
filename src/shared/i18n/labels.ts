const decisionLabels: Record<string,string> = {
  accept_partial: 'Accept the partial receipt', await_remainder: 'Wait for the remaining goods',
  reject: 'Reject the proposal', propose_retry: 'Request another delivery time',
  accept: 'Accept the proposal', unavailable: 'Decision unavailable',
};
export const decisionLabel = (value: string) => decisionLabels[value] ?? 'Review this option with your warehouse';

export const routeModeLabel = (profile: 'car'|'bicycle'|'walking') => ({car:'Car',bicycle:'Bicycle',walking:'Walking'})[profile];
