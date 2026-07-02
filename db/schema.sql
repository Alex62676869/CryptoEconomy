-- Mono & DIV Economy Game
-- Postgres schema for saving simulation snapshots, events, scenarios, policy changes,
-- and longer-term game history.
--
-- The current v1 server can run without Postgres.
-- This schema is ready for persistence when the db layer is added.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS game_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  name TEXT NOT NULL DEFAULT 'Mono & DIV Economy Game',
  status TEXT NOT NULL DEFAULT 'running',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,

  current_tick BIGINT NOT NULL DEFAULT 0,
  current_simulated_day NUMERIC NOT NULL DEFAULT 0,

  difficulty TEXT NOT NULL DEFAULT 'normal',
  adoption_mode TEXT NOT NULL DEFAULT 'normal',
  model_preset TEXT NOT NULL DEFAULT 'balanced_realism',

  notes TEXT
);

CREATE TABLE IF NOT EXISTS state_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,

  tick BIGINT NOT NULL,
  simulated_day NUMERIC NOT NULL,

  state_json JSONB NOT NULL,

  treasury_fiat_usd NUMERIC NOT NULL DEFAULT 0,
  treasury_fiat_real_usd NUMERIC NOT NULL DEFAULT 0,

  treasury_mono NUMERIC NOT NULL DEFAULT 0,
  treasury_div NUMERIC NOT NULL DEFAULT 0,

  circulating_mono NUMERIC NOT NULL DEFAULT 0,
  circulating_div NUMERIC NOT NULL DEFAULT 0,

  mono_market_price NUMERIC NOT NULL DEFAULT 0,
  div_market_price NUMERIC NOT NULL DEFAULT 0,

  systemic_trust NUMERIC NOT NULL DEFAULT 0,
  treasury_control_score NUMERIC NOT NULL DEFAULT 0,
  fiat_displacement_index NUMERIC NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (session_id, tick)
);

CREATE INDEX IF NOT EXISTS idx_state_snapshots_session_tick
  ON state_snapshots(session_id, tick DESC);

CREATE INDEX IF NOT EXISTS idx_state_snapshots_created_at
  ON state_snapshots(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_state_snapshots_state_json
  ON state_snapshots USING GIN (state_json);

CREATE TABLE IF NOT EXISTS game_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,

  tick BIGINT NOT NULL,
  simulated_day NUMERIC NOT NULL,

  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',

  title TEXT,
  message TEXT,

  event_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_events_session_tick
  ON game_events(session_id, tick DESC);

CREATE INDEX IF NOT EXISTS idx_game_events_type
  ON game_events(event_type);

CREATE INDEX IF NOT EXISTS idx_game_events_severity
  ON game_events(severity);

CREATE INDEX IF NOT EXISTS idx_game_events_json
  ON game_events USING GIN (event_json);

CREATE TABLE IF NOT EXISTS active_scenarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,

  scenario_instance_id TEXT NOT NULL,
  scenario_id TEXT NOT NULL,

  name TEXT NOT NULL,
  category TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'exogenous',
  severity TEXT NOT NULL DEFAULT 'minor',

  started_at_tick BIGINT NOT NULL,
  started_at_simulated_day NUMERIC NOT NULL,

  ended_at_tick BIGINT,
  ended_at_simulated_day NUMERIC,

  total_duration_days NUMERIC NOT NULL DEFAULT 0,
  remaining_days NUMERIC NOT NULL DEFAULT 0,

  effects_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  scenario_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (session_id, scenario_instance_id)
);

CREATE INDEX IF NOT EXISTS idx_active_scenarios_session
  ON active_scenarios(session_id);

CREATE INDEX IF NOT EXISTS idx_active_scenarios_scenario_id
  ON active_scenarios(scenario_id);

CREATE INDEX IF NOT EXISTS idx_active_scenarios_category
  ON active_scenarios(category);

CREATE INDEX IF NOT EXISTS idx_active_scenarios_active
  ON active_scenarios(session_id, ended_at_tick)
  WHERE ended_at_tick IS NULL;

CREATE TABLE IF NOT EXISTS policy_changes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,

  tick BIGINT NOT NULL,
  simulated_day NUMERIC NOT NULL,

  source TEXT NOT NULL DEFAULT 'player',

  patch_json JSONB NOT NULL,
  policy_after_json JSONB NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_changes_session_tick
  ON policy_changes(session_id, tick DESC);

CREATE INDEX IF NOT EXISTS idx_policy_changes_patch_json
  ON policy_changes USING GIN (patch_json);

CREATE TABLE IF NOT EXISTS default_changes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,

  tick BIGINT NOT NULL,
  simulated_day NUMERIC NOT NULL,

  source TEXT NOT NULL DEFAULT 'player',

  patch_json JSONB NOT NULL,
  defaults_after_json JSONB NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_default_changes_session_tick
  ON default_changes(session_id, tick DESC);

CREATE INDEX IF NOT EXISTS idx_default_changes_patch_json
  ON default_changes USING GIN (patch_json);

CREATE TABLE IF NOT EXISTS treasury_fiat_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,

  tick BIGINT NOT NULL,
  simulated_day NUMERIC NOT NULL,

  currency_code TEXT NOT NULL,

  usd_equivalent NUMERIC NOT NULL DEFAULT 0,
  real_usd_equivalent NUMERIC NOT NULL DEFAULT 0,

  nominal_yield NUMERIC NOT NULL DEFAULT 0,
  inflation NUMERIC NOT NULL DEFAULT 0,
  expected_fx_decay NUMERIC NOT NULL DEFAULT 0,
  effective_usd_return NUMERIC NOT NULL DEFAULT 0,
  real_return NUMERIC NOT NULL DEFAULT 0,

  trust_score NUMERIC NOT NULL DEFAULT 0,
  liquidity_score NUMERIC NOT NULL DEFAULT 0,
  banking_depth_score NUMERIC NOT NULL DEFAULT 0,
  gdp_depth_score NUMERIC NOT NULL DEFAULT 0,

  capital_control_penalty NUMERIC NOT NULL DEFAULT 0,
  political_risk_penalty NUMERIC NOT NULL DEFAULT 0,

  saturation_level NUMERIC NOT NULL DEFAULT 0,
  local_m2_share NUMERIC NOT NULL DEFAULT 0,

  risk_warning TEXT,

  currency_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (session_id, tick, currency_code)
);

CREATE INDEX IF NOT EXISTS idx_treasury_fiat_snapshots_session_tick
  ON treasury_fiat_snapshots(session_id, tick DESC);

CREATE INDEX IF NOT EXISTS idx_treasury_fiat_snapshots_currency
  ON treasury_fiat_snapshots(currency_code);

CREATE TABLE IF NOT EXISTS warnings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,

  tick BIGINT NOT NULL,
  simulated_day NUMERIC NOT NULL,

  code TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,

  warning_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warnings_session_tick
  ON warnings(session_id, tick DESC);

CREATE INDEX IF NOT EXISTS idx_warnings_code
  ON warnings(code);

CREATE INDEX IF NOT EXISTS idx_warnings_severity
  ON warnings(severity);

CREATE TABLE IF NOT EXISTS explanations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,

  tick BIGINT NOT NULL,
  simulated_day NUMERIC NOT NULL,

  explanation_id TEXT,
  type TEXT NOT NULL DEFAULT 'general',
  asset TEXT,
  severity TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,

  explanation_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_explanations_session_tick
  ON explanations(session_id, tick DESC);

CREATE INDEX IF NOT EXISTS idx_explanations_type
  ON explanations(type);

CREATE INDEX IF NOT EXISTS idx_explanations_asset
  ON explanations(asset);

CREATE TABLE IF NOT EXISTS leaderboard_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,

  player_name TEXT,

  difficulty TEXT NOT NULL,
  adoption_mode TEXT NOT NULL,

  final_tick BIGINT NOT NULL,
  final_simulated_day NUMERIC NOT NULL,

  final_score NUMERIC NOT NULL DEFAULT 0,

  final_treasury_control NUMERIC NOT NULL DEFAULT 0,
  final_systemic_trust NUMERIC NOT NULL DEFAULT 0,
  final_fiat_displacement NUMERIC NOT NULL DEFAULT 0,

  survived BOOLEAN NOT NULL DEFAULT TRUE,
  failure_reason TEXT,

  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_runs_score
  ON leaderboard_runs(final_score DESC);

CREATE INDEX IF NOT EXISTS idx_leaderboard_runs_difficulty
  ON leaderboard_runs(difficulty);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_game_sessions_updated_at ON game_sessions;
CREATE TRIGGER update_game_sessions_updated_at
BEFORE UPDATE ON game_sessions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_active_scenarios_updated_at ON active_scenarios;
CREATE TRIGGER update_active_scenarios_updated_at
BEFORE UPDATE ON active_scenarios
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE VIEW latest_state_snapshots AS
SELECT DISTINCT ON (session_id)
  *
FROM state_snapshots
ORDER BY session_id, tick DESC;

CREATE OR REPLACE VIEW active_game_scenarios AS
SELECT
  *
FROM active_scenarios
WHERE ended_at_tick IS NULL;

CREATE OR REPLACE VIEW latest_session_summary AS
SELECT
  gs.id AS session_id,
  gs.name,
  gs.status,
  gs.difficulty,
  gs.adoption_mode,
  gs.model_preset,
  gs.current_tick,
  gs.current_simulated_day,
  ss.treasury_fiat_usd,
  ss.treasury_fiat_real_usd,
  ss.treasury_mono,
  ss.treasury_div,
  ss.circulating_mono,
  ss.circulating_div,
  ss.mono_market_price,
  ss.div_market_price,
  ss.systemic_trust,
  ss.treasury_control_score,
  ss.fiat_displacement_index,
  gs.created_at,
  gs.updated_at
FROM game_sessions gs
LEFT JOIN latest_state_snapshots ss
  ON ss.session_id = gs.id;
