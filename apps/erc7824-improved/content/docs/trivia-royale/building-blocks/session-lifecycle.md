---
title: Session Lifecycle
description: Managing active sessions, auto-joining, and cleanup
---

# Session Lifecycle

The `BetterNitroliteClient` automatically tracks active sessions throughout their lifecycle. Understanding this helps you build robust applications that handle session state correctly.

## Active Session Tracking

Sessions are tracked in a Set that's automatically updated:

```typescript
const client = createBetterNitroliteClient({ wallet });
await client.connect();

// Initially empty
let sessions = client.getActiveSessions();
// → []

// After creating a session
const sessionId = await client.createSession(request, signatures);

sessions = client.getActiveSessions();
// → ['0xabc123...']

// After closing
await client.closeSession(sessionId, finalAllocations);

sessions = client.getActiveSessions();
// → []
```

## Auto-Joining Sessions

When you receive your first message in a session, it's automatically added:

```typescript
onAppMessage: (type, sessionId, data) => {
  // You haven't explicitly joined, but ClearNode sent you a message
  console.log(`Received ${type} in ${sessionId}`);

  // Session is now tracked
  const sessions = client.getActiveSessions();
  console.log(sessions.includes(sessionId)); // → true
}
```

This enables:
- **Receiving session invites** without explicit join flow
- **Passive participation** where you only respond to messages
- **Simplified client code** - no manual session registration

## Lifecycle Events

### OnSessionClosed Callback

Register a handler for session closures:

```typescript
const client = createBetterNitroliteClient({
  wallet,
  onSessionClosed: (sessionId, finalAllocations) => {
    console.log(`Session ${sessionId} closed`);

    // Clean up session-specific state
    delete gameStates[sessionId];
    delete messageCaches[sessionId];

    // Update UI
    updateActiveGamesList();
  }
});
```

**Note**: Currently, ClearNode only notifies the closer (not all participants). Design for this:

```typescript
// Server closes and broadcasts final message
await server.closeSession(sessionId, allocations);
await server.sendMessage(sessionId, 'game_over', { allocations });

// Players handle game_over as implicit close
onAppMessage: (type, sessionId, data) => {
  if (type === 'game_over') {
    // Manually clean up since we may not get onSessionClosed
    cleanupSession(sessionId);
  }
}
```

## Manual Session Management

### Checking if Session is Active

```typescript
const sessionId = '0xabc123...';
const isActive = client.getActiveSessions().includes(sessionId);

if (isActive) {
  await client.sendMessage(sessionId, 'move', { ... });
} else {
  console.error('Session already closed');
}
```

### Pre-Flight Check Before Sending

```typescript
async function safeSendMessage(sessionId, type, data) {
  const activeSessions = client.getActiveSessions();

  if (!activeSessions.includes(sessionId)) {
    throw new Error(`Session ${sessionId} is not active`);
  }

  try {
    await client.sendMessage(sessionId, type, data);
  } catch (error) {
    // Session might have closed during send
    if (error.message.includes('not active')) {
      console.warn('Session closed during send');
      // Update local state
      cleanupSession(sessionId);
    }
    throw error;
  }
}
```

## State Cleanup Patterns

### Pattern 1: Map-Based State

```typescript
const sessionStates = new Map();

onAppMessage: (type, sessionId, data) => {
  // Initialize state on first message
  if (!sessionStates.has(sessionId)) {
    sessionStates.set(sessionId, {
      players: [],
      scores: {},
      round: 0
    });
  }

  const state = sessionStates.get(sessionId);
  // ... update state
}

onSessionClosed: (sessionId) => {
  // Clean up
  sessionStates.delete(sessionId);
}
```

### Pattern 2: Session Objects

```typescript
class GameSession {
  constructor(sessionId, players) {
    this.sessionId = sessionId;
    this.players = players;
    this.scores = new Map();
  }

  handleMessage(type, data) {
    // ... game logic
  }

  cleanup() {
    this.scores.clear();
    // ... other cleanup
  }
}

const activeSessions = new Map();

onAppMessage: (type, sessionId, data) => {
  let session = activeSessions.get(sessionId);

  if (!session) {
    session = new GameSession(sessionId, data.players);
    activeSessions.set(sessionId, session);
  }

  session.handleMessage(type, data);
}

onSessionClosed: (sessionId) => {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.cleanup();
    activeSessions.delete(sessionId);
  }
}
```

## Next Steps

- **[Fund Management](./fund-management)**: Understanding balance changes during sessions
- **[Complete Game](../patterns/complete-game)**: See lifecycle management in action
- **[Error Handling](../patterns/error-handling)**: Handle session failures gracefully
