// app/agent/[id]/page.tsx — Agent permalink route
// Re-exports the main page so /agent/123 loads the same UI
// The page.client.tsx reads the agent ID from the URL
export { default } from '../../page'
