import fs from 'fs';
import path from 'path';
import { generateMatch, recordMatch } from '../app/utils/matchmaking';
import { Player, MatchmakingStrategy, MatchHistory, Match } from '../app/types';

// Helper to load players from test_players.txt
function loadPlayers(): Player[] {
    const filePath = path.join(process.cwd(), 'test_players.txt');
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').filter(line => line.trim()).map((line, index) => {
        const parts = line.split(/\s+/);
        const skillStr = parts[parts.length - 1];
        const skill = parseFloat(skillStr);
        const name = parts.slice(0, parts.length - 1).join(' ');
        
        return {
            id: `p${index + 1}`,
            name,
            skill: isNaN(skill) ? 3.0 : skill,
            ladderRank: 0,
            status: 'waiting',
            waitTime: 0,
            gamesPlayed: 0,
            consecutiveSkips: 0
        };
    });
}

function simulateSession(strategy: MatchmakingStrategy) {
    let players = loadPlayers();
    let history: MatchHistory[] = [];
    let nextMatchId = 1;
    let courts: { number: number, currentMatch: Match | null }[] = [
        { number: 1, currentMatch: null },
        { number: 2, currentMatch: null },
        { number: 3, currentMatch: null },
        { number: 4, currentMatch: null },
    ];

    const courtCount = 4;
    let totalWaitTimeWhenSelected = 0;
    let totalSkillGaps = 0;
    let selectionCount = 0;
    const courtMatchesCount = [0, 0, 0, 0, 0];

    let ticks = 0;
    while (courtMatchesCount.slice(1).some(count => count < 12)) {
        ticks++;
        
        // Advance time
        players.forEach(p => {
            if (p.status === 'waiting') p.waitTime += 1;
        });

        // Simulate matches ending every 5 ticks
        if (ticks % 5 === 0) {
            courts.forEach(c => {
                if (c.currentMatch) {
                    const match = c.currentMatch;
                    history.push(recordMatch(match));
                    const playingIds = [match.teamA.partner1.id, match.teamA.partner2.id, match.teamB.partner1.id, match.teamB.partner2.id];
                    players.forEach(p => {
                        if (playingIds.includes(p.id)) {
                            p.status = 'waiting';
                            p.gamesPlayed += 1;
                        }
                    });
                    c.currentMatch = null;
                }
            });
        }

        // Fill courts
        courts.forEach(c => {
            if (c.currentMatch === null && courtMatchesCount[c.number] < 12) {
                const available = players.filter(p => p.status === 'waiting');
                if (available.length >= 4) {
                    // Update: Pass courtCount as 6th argument
                    const match = generateMatch(c.number, players, strategy, history, `m_${nextMatchId++}`, courtCount);
                    if (match) {
                        c.currentMatch = match;
                        courtMatchesCount[c.number]++;
                        selectionCount++;
                        
                        // Collect Metrics
                        const pIds = [match.teamA.partner1.id, match.teamA.partner2.id, match.teamB.partner1.id, match.teamB.partner2.id];
                        const selected = players.filter(p => pIds.includes(p.id));
                        totalWaitTimeWhenSelected += selected.reduce((sum, p) => sum + p.waitTime, 0);
                        
                        const gap = Math.abs(match.teamA.avgSkill - match.teamB.avgSkill);
                        if (!isNaN(gap)) totalSkillGaps += gap;

                        // Update status and skips (Logic from SessionPage.startMatch)
                        players.forEach(p => {
                            if (pIds.includes(p.id)) {
                                p.status = 'playing';
                                p.waitTime = 0;
                                p.consecutiveSkips = 0; // Reset
                            } else if (p.status === 'waiting') {
                                p.consecutiveSkips += 1; // Increment for skipped waiting players
                            }
                        });
                    }
                }
            }
        });

        if (ticks > 5000) break;
    }

    const partnerPairs = new Set<string>();
    history.forEach(h => {
        const teamAP1 = h.pairings[0].player1Id;
        const teamAP2 = h.pairings[0].player2Id;
        const teamBP1 = h.pairings[1].player1Id;
        const teamBP2 = h.pairings[1].player2Id;
        const pairA = [teamAP1, teamAP2].sort().join('-');
        const pairB = [teamBP1, teamBP2].sort().join('-');
        partnerPairs.add(pairA);
        partnerPairs.add(pairB);
    });

    const games = players.map(p => p.gamesPlayed);
    const avgGames = games.reduce((a, b) => a + b, 0) / games.length;
    const stdDevGames = Math.sqrt(games.reduce((a, b) => a + Math.pow(b - avgGames, 2), 0) / games.length);

    return {
        strategy,
        avgSkillGap: selectionCount > 0 ? (totalSkillGaps / selectionCount).toFixed(3) : 'N/A',
        avgWaitTime: selectionCount > 0 ? (totalWaitTimeWhenSelected / (selectionCount * 4)).toFixed(1) : 'N/A',
        totalUniquePartnerings: partnerPairs.size,
        stdDevGames: stdDevGames.toFixed(2),
        minMaxGames: `${Math.min(...games)} - ${Math.max(...games)}`
    };
}

console.log("Full Session Simulation Results (Updated Logic with consecutiveSkips Priority)");
console.table([
    simulateSession('balanced'),
    simulateSession('wait-time'),
    simulateSession('variety')
]);
