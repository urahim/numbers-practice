// 朝日ナンバーズの実測プレイデータをもとに考察した「それらしい」スコア推定ロジック。
// 本番の正確な計算式は不明なため、完全再現ではなく、お題の難易度・使ったマス数で
// 得点が変わる体験を再現することを目的とする。
// 実測データの分析により、回答スピードは得点に影響しないことが確認できたため、
// スピードボーナスは含めていない（同じお題・同じブロック数で、1秒と5秒でも
// 得点が完全一致する例が複数確認された）。
// 奇数/偶数/素数は、数字のお題とは別の「1マスあたり定額×ブロック数」という
// シンプルな式で決まっていることが実測データで確認できたため、
// targetBase/blockBonusとは独立に計算する（ブロック数ボーナスの概念が無い）。
// 配点テーブルは scoring-config.json に外出ししてあり、今後データが増えたら
// このファイルを書き換えるだけで調整できるようにしている。
const ScoringEngine = (() => {
  const FALLBACK_CONFIG = {
    pointsUnit: 1000,
    targetBase: {},
    targetBaseDefault: 30,
    blockBonus: { "2": 1.0, "3": 1.4, "4": 1.8, "5": 2.2, "6": 2.5, "7": 2.8, "8": 3.0, "9+": 3.2 },
    propertyModeRate: { 奇数: 4, 偶数: 4, 素数: 6 },
    clearCountBonus: [{ min: 0, max: null, rate: 0 }],
  };

  let config = null;

  const ready = fetch("scoring-config.json")
    .then((res) => res.json())
    .then((json) => {
      config = json;
    })
    .catch(() => {
      config = FALLBACK_CONFIG;
    });

  // 基準点は「実際に作った合計の数字」で引く（奇数/偶数/素数モードも同じ表を使う）。
  // 奇数/偶数/素数には上限が無く、小さい数字を多数つなげれば表の範囲(24)を
  // 簡単に超えてしまう。それより上の値がどう配点されるかは実測データが無いため、
  // 際限なく伸ばさず表の最大値で頭打ちにする（一部だけ実測データより高くなる事故を防ぐ）。
  function targetBaseFor(sum) {
    const key = String(sum);
    if (key in config.targetBase) return config.targetBase[key];
    const keys = Object.keys(config.targetBase).map(Number);
    if (keys.length === 0) return config.targetBaseDefault;
    const maxKey = Math.max(...keys);
    if (sum > maxKey) return config.targetBase[String(maxKey)];
    return config.targetBaseDefault;
  }

  function blockBonusFor(blockCount) {
    const key = blockCount >= 9 ? "9+" : String(blockCount);
    return config.blockBonus[key] ?? 1.0;
  }

  // 1問正解したときの得点
  function scoreForAnswer({ sum, blockCount, label }) {
    if (label in config.propertyModeRate) {
      return config.propertyModeRate[label] * config.pointsUnit * blockCount;
    }
    const raw = targetBaseFor(sum) * config.pointsUnit * blockBonusFor(blockCount);
    return Math.round(raw / 1000) * 1000;
  }

  // ゲーム終了時：正解数に応じたボーナス（%）を加算した最終スコアを返す
  function finalizeScore(rawTotal, clearCount) {
    const entry =
      config.clearCountBonus.find(
        (e) => clearCount >= e.min && (e.max === null || clearCount <= e.max)
      ) || config.clearCountBonus[0];
    const bonus = Math.round((rawTotal * entry.rate) / 1000) * 1000;
    return { rawTotal, bonus, bonusRate: entry.rate, finalTotal: rawTotal + bonus };
  }

  return { ready, scoreForAnswer, finalizeScore };
})();
