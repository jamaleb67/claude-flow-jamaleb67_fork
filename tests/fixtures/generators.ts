export function generateTerminalSessions(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `session-${index}`,
    agentId: `agent-${index}`,
    lastActivity: new Date(),
    status: 'active',
  }));
}

export function generateEdgeCaseData() {
  return {
    emptyString: '',
    longString: 'x'.repeat(1024),
    nullValue: null,
    undefinedValue: undefined,
    nestedObject: { a: { b: { c: 'value' } } },
    arrayWithNulls: [1, null, 3],
  };
}

export function generateMemoryEntries(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    namespace: 'test',
    key: `key-${index}`,
    value: { content: `value-${index}` },
    tags: ['test'],
    metadata: { index },
  }));
}

export function generateCoordinationTasks(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `task-${index}`,
    priority: index % 3 === 0 ? 'high' : index % 2 === 0 ? 'medium' : 'low',
    execute: async () => `result-${index}`,
  }));
}

export function generateErrorScenarios() {
  return [
    { description: 'network failure', error: new Error('Network error') },
    { description: 'timeout', error: new Error('Operation timed out') },
    { description: 'validation', error: new Error('Validation failed') },
  ];
}

export function generateMCPMessages() {
  return {
    requests: [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { clientInfo: { name: 'test', version: '1.0.0' } },
      },
    ],
    responses: [
      {
        jsonrpc: '2.0',
        id: 1,
        result: { capabilities: {} },
      },
    ],
  };
}
