export function getGatewayPairingLayout(hasEnrollmentCode: boolean) {
  return {
    showDevicePicker: true,
    showPairingCode: hasEnrollmentCode,
    showGatewayForm: !hasEnrollmentCode,
  } as const;
}
