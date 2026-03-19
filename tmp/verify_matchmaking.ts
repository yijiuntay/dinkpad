import fs from 'fs';
import path from 'path';
import { generateMatch, recordMatch } from '../app/utils/matchmaking';
import { Player, MatchmakingStrategy, MatchHistory } from '../app/types';

// Helper to load players from test_players.txt
function loadPlayers(): Player[] {
    const filePath = path.join(process.cwd(), 'test_players.txt');
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').filter(line => line.trim()).map((line, index) => {
        const parts = line.split(' ');
        const skill = parseFloat(parts[parts.length - 1]);
        const name = parts.slice(0, parts.length - 1).join(' ');
        return {
            id: `p${index + 1}`,
            name,
            skill,
            status: 'waiting',
            waitTime: 0,
            gamesPlayed: 0
        };
    });
}

function runScenario(name: string, players: Player[], strategy: MatchmakingStrategy, history: MatchHistory[] = []) {
    console.log(`\n--- Scenario: ${name} ---`);
    console.log(`Strategy: ${strategy}`);
    
    const match = generateMatch(1, players, strategy, history, 'test_match_1');
    
    if (match) {
        console.log(`Team A: ${match.teamA.partner1.name} (${match.teamA.partner1.skill}) & ${match.teamA.partner2.name} (${match.teamA.partner2.skill}) [Avg: ${match.teamA.avgSkill.toFixed(2)}]`);
        console.log(`Team B: ${match.teamB.partner1.name} (${match.teamB.partner1.skill}) & ${match.teamB.partner2.name} (${match.teamB.partner2.skill}) [Avg: ${match.teamB.avgSkill.toFixed(2)}]`);
        console.log(`Skill Gap: ${Math.abs(match.teamA.avgSkill - match.teamB.avgSkill).toFixed(2)}`);
    } else {
        console.log("Failed to generate match.");
    }
}

// 1. Balanced Scenario
const players1 = loadPlayers();
runScenario("Balanced Skill Gap", players1, "balanced");

// 2. Wait-Time Scenario
const players2 = loadPlayers();
// Assign long wait times to low-skill players (e.g. 2.5)
players2.forEach(p => {
    if (p.skill === 2.5) p.waitTime = 500;
    else p.waitTime = 10;
});
runScenario("Minimize Wait Time (Low-skill players waiting long)", players2, "wait-time");

// 3. Variety Scenario
const players3 = loadPlayers().slice(0, 6); // Take first 6
players3.forEach(p => p.waitTime = 100); // Equal wait time
// Alice (p1) and Bob (p2) were partners before
const history: MatchHistory[] = [{
    matchId: 'prev_match',
    players: ['p1', 'p2', 'p3', 'p4'],
    timestamp: Date.now() - 1000,
    pairings: [
        { player1Id: 'p1', player2Id: 'p2', asPartners: 1, asOpponents: 0, lastMatchedAt: Date.now() - 1000 }
    ]
}];
runScenario("Maximize Variety (Alice & Bob were partners)", players3, "variety", history);
