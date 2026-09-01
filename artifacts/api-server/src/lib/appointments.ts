export function serializeAppointment<T extends { createdAt: Date | string }>(
  appointment: T,
): T & { createdAt: string } {
  return {
    ...appointment,
    createdAt:
      appointment.createdAt instanceof Date
        ? appointment.createdAt.toISOString()
        : appointment.createdAt,
  };
}