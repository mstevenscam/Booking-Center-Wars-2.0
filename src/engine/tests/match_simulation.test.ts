import test from 'node:test';
import assert from 'node:assert/strict';
import { runEmpiricalSimulation, ConfigStats, StartingConfig } from '../match_simulator.ts';

test('Empirical match simulation across baseline and proposed compensation models', () => {
  const configsToTest: StartingConfig[] = [
    'CONFIG_A',
    'CONFIG_B',
    'CONFIG_C',
    'CONFIG_D',
    'CONFIG_E',
    'CONFIG_F',
    'CONFIG_G',
    'CONFIG_H',
    'CONFIG_I'
  ];

  // 1,000 matches per configuration = 9,000 total matches
  const stats = runEmpiricalSimulation(1000, configsToTest, 42);

  assert.equal(stats.length, 9, 'Must evaluate all 9 configurations');

  for (const s of stats) {
    console.log(`\n=== RESULTS FOR ${s.configName} (${s.totalMatches} matches) ===`);
    console.log(`P1 Win Rate: ${s.p1WinPct}% (95% CI: [${s.confidenceInterval95[0]}%, ${s.confidenceInterval95[1]}%])`);
    console.log(`P2 Win Rate: ${s.p2WinPct}%`);
    console.log(`Average Duration: ${s.avgTurns} turns (Median: ${s.medianTurns} turns)`);
    console.log('Archetype Matchups (P1 Win %):');
    for (const [matchup, data] of Object.entries(s.archetypeBreakdown)) {
      console.log(`  - ${matchup}: ${data.p1WinPct}% (${data.p1Wins}/${data.total})`);
    }
  }

  const configA = stats.find(s => s.config === 'CONFIG_A')!;
  const configD = stats.find(s => s.config === 'CONFIG_D')!;
  const configE = stats.find(s => s.config === 'CONFIG_E')!;
  const configH = stats.find(s => s.config === 'CONFIG_H')!;

  assert.ok(configA.p1WinPct > 65.0, 'Config A should exhibit severe first-player advantage');
  assert.ok(configD.p1WinPct < configA.p1WinPct, 'Config D should significantly reduce P1 advantage over Config A');
});
