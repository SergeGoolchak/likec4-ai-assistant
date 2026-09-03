/**
 * Единая точка доступа к PAT для Confluence/Bitbucket и API-ключам LLM.
 * Значения никогда не пересекают эту границу, кроме как в тот единственный
 * адаптер, которому они нужны для собственного исходящего HTTP-запроса —
 * никогда в LLM prompts, логи или сообщения UserFacingError. См. риск №5.
 */
export interface SecretsVault {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Только ключи — чтобы UI настроек мог показать "настроено", ни разу не читая само значение. */
  list(): Promise<string[]>;
}
