-- 1. テーブル作成
CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid() NOT NULL,
  date date NOT NULL,
  text text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE work_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid() NOT NULL,
  date date NOT NULL,
  status text NOT NULL CHECK (status IN ('office', 'remote', 'paid_full', 'paid_am', 'paid_pm', 'holiday_work', 'off')),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE TABLE settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid() NOT NULL UNIQUE,
  data jsonb NOT NULL
);

-- 2. Row Level Security（RLS）設定：本人データのみアクセス許可
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own events" ON events FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own work_records" ON work_records FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own settings" ON settings FOR ALL USING (auth.uid() = user_id);

-- 3. 初期設定の自動投入（新規ユーザー登録時のトリガー設定）
-- 新規ユーザー登録時にデフォルト設定を settings テーブルに作成する関数
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.settings (user_id, data)
  VALUES (NEW.id, '{
    "workDefaults": {
      "mon": "remote",
      "tue": "office",
      "wed": "office",
      "thu": "remote",
      "fri": "remote",
      "sat": "off",
      "sun": "off"
    },
    "garbageSchedule": [
      { "type": "燃えるゴミ", "weekdays": [1, 4], "weeks": [] },
      { "type": "プラスチック", "weekdays": [6], "weeks": [] },
      { "type": "資源", "weekdays": [2], "weeks": [] },
      { "type": "燃えないゴミ", "weekdays": [5], "weeks": [2, 4] }
    ],
    "weatherLocation": {
      "name": "東京",
      "lat": 35.68,
      "lon": 139.76
    }
  }'::jsonb);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- トリガーの作成：auth.users にレコードが挿入されたら発火
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
