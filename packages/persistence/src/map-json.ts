/**
 * `PipelineState.stageOutputs.architectureGraph` holds `Map` instances
 * (elements/relationships/views/byKind/byTag/neighborsIndex/sourceFileOf —
 * see core-domain's session.ts doc comment, which flagged this exact
 * marshalling gap back in Milestone 0 as "deferred to Milestone 5"). Plain
 * `JSON.stringify` drops Maps silently (empty object) — this replacer/
 * reviver pair round-trips them through a tagged array-of-entries form
 * instead of hand-writing field-specific (de)serialization, so any future
 * Map added to session state is handled automatically too.
 */
const MAP_TAG = '__map__';

interface SerializedMap {
  [MAP_TAG]: true;
  entries: [unknown, unknown][];
}

export function mapAwareReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    const serialized: SerializedMap = { [MAP_TAG]: true, entries: [...value.entries()] };
    return serialized;
  }
  return value;
}

export function mapAwareReviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && (value as Partial<SerializedMap>)[MAP_TAG] === true) {
    return new Map((value as SerializedMap).entries);
  }
  return value;
}
