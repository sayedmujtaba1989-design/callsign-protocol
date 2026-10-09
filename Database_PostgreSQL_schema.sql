-- Callsign Protocol - PostgreSQL Schema
-- Relational data: Users, Matches, Stats, Cosmetics, Rankings

-- Users Table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(120) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(50),
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  total_playtime_minutes INTEGER DEFAULT 0,
  account_level INTEGER DEFAULT 1
);

-- Player Profiles Table
CREATE TABLE player_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bio TEXT,
  country VARCHAR(2),
  region VARCHAR(50),
  preferred_role VARCHAR(50),
  role_proficiencies JSONB, -- {"SquadLeader": 1500, "CommsSpecialist": 1200, ...}
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Matches Table
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_name VARCHAR(100) NOT NULL,
  game_mode VARCHAR(50) DEFAULT '5v5', -- 5v5 or 8v8
  duration_seconds INTEGER,
  alpha_team_id UUID,
  bravo_team_id UUID,
  alpha_score INTEGER DEFAULT 0,
  bravo_score INTEGER DEFAULT 0,
  winner VARCHAR(10), -- 'alpha', 'bravo', or 'draw'
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  server_id VARCHAR(50),
  replay_id UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Match Players (join table)
CREATE TABLE match_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  team VARCHAR(10) NOT NULL, -- 'alpha' or 'bravo'
  role VARCHAR(50), -- 'SquadLeader', 'CommsSpecialist', etc
  kills INTEGER DEFAULT 0,
  deaths INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  score INTEGER DEFAULT 0,
  damage_dealt FLOAT DEFAULT 0,
  damage_taken FLOAT DEFAULT 0,
  objectives_completed INTEGER DEFAULT 0,
  accuracy_percentage FLOAT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Player Statistics Table
CREATE TABLE player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_matches INTEGER DEFAULT 0,
  total_wins INTEGER DEFAULT 0,
  total_losses INTEGER DEFAULT 0,
  win_rate FLOAT DEFAULT 0,
  kill_death_ratio FLOAT DEFAULT 0,
  total_kills INTEGER DEFAULT 0,
  total_deaths INTEGER DEFAULT 0,
  total_assists INTEGER DEFAULT 0,
  average_score FLOAT DEFAULT 0,
  total_playtime_seconds BIGINT DEFAULT 0,
  headshot_percentage FLOAT DEFAULT 0,
  current_rank VARCHAR(50) DEFAULT 'Bronze',
  rank_points INTEGER DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cosmetics Inventory Table
CREATE TABLE cosmetics_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cosmetic_id VARCHAR(100) NOT NULL,
  cosmetic_type VARCHAR(50), -- 'skin', 'weapon', 'emote', 'finisher'
  cosmetic_name VARCHAR(100),
  acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_equipped BOOLEAN DEFAULT false,
  rarity VARCHAR(50) -- 'common', 'rare', 'epic', 'legendary'
);

-- Battle Pass Progress Table
CREATE TABLE battle_pass_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_number INTEGER NOT NULL,
  current_tier INTEGER DEFAULT 0,
  max_tier INTEGER DEFAULT 50,
  experience_points INTEGER DEFAULT 0,
  is_premium BOOLEAN DEFAULT false,
  purchased_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, season_number)
);

-- Ranked Ladder Table
CREATE TABLE ranked_ladder (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_rating INTEGER DEFAULT 0, -- Elo rating
  rank_tier VARCHAR(50), -- Bronze, Silver, Gold, Platinum, Diamond, Master
  rank_position INTEGER,
  season_number INTEGER,
  promotions_count INTEGER DEFAULT 0,
  demotions_count INTEGER DEFAULT 0,
  wins_this_season INTEGER DEFAULT 0,
  losses_this_season INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, season_number)
);

-- Replays Metadata Table
CREATE TABLE replays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id),
  uploader_id UUID NOT NULL REFERENCES users(id),
  storage_path VARCHAR(255),
  storage_provider VARCHAR(50), -- 's3', 'gcs', 'local'
  file_size_bytes BIGINT,
  duration_seconds INTEGER,
  compression_ratio FLOAT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  view_count INTEGER DEFAULT 0,
  is_public BOOLEAN DEFAULT false
);

-- Achievements Table
CREATE TABLE achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_key VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon_url TEXT,
  difficulty_level VARCHAR(50), -- 'easy', 'medium', 'hard', 'legendary'
  category VARCHAR(50), -- 'combat', 'teamwork', 'progression', etc
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Player Achievements (join table)
CREATE TABLE player_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements(id),
  unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, achievement_id)
);

-- Bans Table (for moderation)
CREATE TABLE bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  ban_reason TEXT NOT NULL,
  banned_by VARCHAR(50),
  ban_duration_hours INTEGER, -- NULL = permanent
  banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

-- Transactions Table (cosmetics purchases)
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  transaction_type VARCHAR(50), -- 'cosmetic_purchase', 'battle_pass', 'currency_pack'
  amount_cents INTEGER,
  currency VARCHAR(3) DEFAULT 'USD',
  payment_method VARCHAR(50), -- 'stripe', 'paypal', 'appstore', 'playstore'
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'refunded'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

-- ============ Indexes ============

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_player_profiles_user_id ON player_profiles(user_id);
CREATE INDEX idx_matches_created_at ON matches(created_at);
CREATE INDEX idx_matches_map_name ON matches(map_name);
CREATE INDEX idx_match_players_match_id ON match_players(match_id);
CREATE INDEX idx_match_players_user_id ON match_players(user_id);
CREATE INDEX idx_player_stats_user_id ON player_stats(user_id);
CREATE INDEX idx_ranked_ladder_rank_tier ON ranked_ladder(rank_tier);
CREATE INDEX idx_ranked_ladder_season ON ranked_ladder(season_number);
CREATE INDEX idx_cosmetics_user_id ON cosmetics_inventory(user_id);
CREATE INDEX idx_battle_pass_user_season ON battle_pass_progress(user_id, season_number);
CREATE INDEX idx_replays_match_id ON replays(match_id);
CREATE INDEX idx_replays_uploader_id ON replays(uploader_id);
CREATE INDEX idx_player_achievements_user_id ON player_achievements(user_id);
CREATE INDEX idx_bans_user_id ON bans(user_id);
CREATE INDEX idx_bans_expires_at ON bans(expires_at);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_status ON transactions(status);

-- ============ Views ============

-- Player Leaderboard View
CREATE VIEW player_leaderboard AS
SELECT
  u.id,
  u.username,
  u.display_name,
  ps.current_rating,
  ps.rank_tier,
  ps.total_wins,
  ps.total_losses,
  ps.win_rate,
  ps.kill_death_ratio,
  rl.rank_position
FROM users u
JOIN ranked_ladder rl ON u.id = rl.user_id
JOIN player_stats ps ON u.id = ps.user_id
WHERE rl.season_number = EXTRACT(YEAR FROM CURRENT_DATE) * 100 + EXTRACT(MONTH FROM CURRENT_DATE)
ORDER BY rl.rank_position;

-- ============ Functions ============

-- Function to update player stats after match
CREATE OR REPLACE FUNCTION update_player_stats_after_match()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE player_stats
  SET
    total_matches = total_matches + 1,
    total_kills = total_kills + NEW.kills,
    total_deaths = total_deaths + NEW.deaths,
    total_assists = total_assists + NEW.assists,
    last_updated = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_player_stats
AFTER INSERT ON match_players
FOR EACH ROW
EXECUTE FUNCTION update_player_stats_after_match();
