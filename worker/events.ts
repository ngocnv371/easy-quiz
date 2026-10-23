// App events for Workers Analytics Engine (binding EVENTS, dataset easy_quiz_events): one data point
// per event, queryable with SQL from the dashboard or the API.
//   index1 = member id (or the event name), blob1 = event, blob2 = detail, blob3 = member id;
//   double1 = an amount (energy, credits, VND), if any.
// Events: guest, signup, email_verified, sign_in, guest_upgraded, quiz_started, attempt_submitted,
// endless_answer, out_of_energy, quiz_saved, questions_imported, ai_generated, checkout, order_paid,
// client_error, server_error.
import type { Env } from './env.ts'

export function track(env: Env, event: string, { user = '', detail = '', value = 0 }: { user?: string; detail?: string; value?: number } = {}) {
  try {
    env.EVENTS?.writeDataPoint({
      indexes: [String(user || event).slice(0, 96)],
      blobs: [event, String(detail).slice(0, 256), user],
      doubles: [Number(value) || 0],
    })
  } catch (e) {
    console.error('track', event, e) // never let analytics break a request
  }
}
