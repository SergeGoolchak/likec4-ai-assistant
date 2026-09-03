import type { LikeC4 } from 'likec4';

interface Location {
  uri: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
}

interface LikeC4ModelLocatorLike {
  locateElement(fqn: string): Location | null;
  locateRelation(id: string): Location | null;
  locateView(viewId: string): Location | null;
}

/**
 * `LikeC4` exposes `.languageServices` publicly, but the underlying Langium
 * service registry that carries `ModelLocator` (used for editor "go to
 * definition") sits on a field the package's own .d.ts marks `protected`.
 * TypeScript's `protected` is compile-time only, so it is still reachable at
 * runtime — and `LikeC4ModelLocator` itself IS a documented, exported class
 * from the package, so this is "public API reached through an
 * undocumented path", not a private implementation detail. Still, this is
 * exactly the kind of thing plan risk #7 warned about: isolated here, in one
 * place, so a future `likec4` upgrade that reshuffles this only requires
 * fixing this one function. `likec4-adapter`'s package.json pins an exact
 * `likec4` version for this reason — bump it deliberately, re-run this
 * adapter's tests, and only then move the pin.
 */
export function getModelLocator(instance: LikeC4): LikeC4ModelLocatorLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const langium = (instance as any).langium;
  const locator = langium?.likec4?.likec4?.ModelLocator as LikeC4ModelLocatorLike | undefined;
  if (!locator) {
    throw new Error(
      'likec4-adapter: could not reach LikeC4ModelLocator through likec4@' +
        '1.59.3 internals — the package layout has likely changed, see model-locator.ts',
    );
  }
  return locator;
}
