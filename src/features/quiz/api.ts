import { api } from '@/lib/api'
import type { TopicRow } from '@/lib/domain'

/** Every active topic: Endless's subject picker and the topic boards choose from these. */
export async function fetchTopics(): Promise<TopicRow[]> {
  return api<TopicRow[]>('topics')
}
