/** Stdio when stdin is not a terminal. Streamable HTTP otherwise. Same predicate as status-mcp. */
export function useStdioTransport(stdin: { isTTY?: boolean } = process.stdin): boolean {
  return stdin.isTTY !== true;
}
