import type { Task } from "../core/types.js";

/**
 * GAIA-style multi-step reasoning tasks.
 *
 * Unlike HLE (pure knowledge), these require:
 * - Multi-step logical chains
 * - Arithmetic within reasoning
 * - Information synthesis from context
 * - Constraint satisfaction
 * - Everyday reasoning (not academic)
 *
 * All text-only (no file attachments needed).
 * Based on GAIA Level 1-2 difficulty patterns.
 */

export const gaiaTrainTasks: Task[] = [
  // --- Multi-step arithmetic reasoning ---
  {
    id: "gt01_compound",
    description: "Multi-step: compound interest",
    input: `You invest $10,000 at 5% annual compound interest. After 3 years, you withdraw half the total amount. Then the remaining amount continues to earn 5% compound interest for 2 more years. How much money do you have at the end? Round to the nearest dollar. Answer with just the number.`,
    expectedAnswer: "6415",
    domain: "reasoning",
  },
  {
    id: "gt02_schedule",
    description: "Multi-step: scheduling constraint",
    input: `A meeting needs exactly 3 people from a team of 5: Alice, Bob, Carol, Dave, Eve. Constraints: (1) Alice and Bob cannot both attend, (2) if Carol attends, Dave must attend, (3) Eve must attend. How many valid groups of 3 are there? Answer with just the number.`,
    expectedAnswer: "3",
    domain: "reasoning",
  },
  {
    id: "gt03_currency",
    description: "Multi-step: currency conversion chain",
    input: `You have 1000 USD. You convert to EUR at rate 1 USD = 0.92 EUR. Then you convert EUR to GBP at rate 1 EUR = 0.86 GBP. Then GBP to JPY at rate 1 GBP = 190 JPY. How many JPY do you have? Round to nearest whole number. Answer with just the number.`,
    expectedAnswer: "150308",
    domain: "reasoning",
  },
  {
    id: "gt04_logic",
    description: "Multi-step: logic puzzle",
    input: `Four friends ordered different drinks: coffee, tea, juice, water. Clues: (1) The person who ordered coffee sits next to the tea drinker. (2) Alice didn't order coffee or water. (3) Bob ordered juice. (4) Carol sits between Alice and Dave. (5) The water drinker sits at one end. What did Alice order? Answer with just the drink name.`,
    expectedAnswer: "tea",
    domain: "reasoning",
  },
  {
    id: "gt05_data",
    description: "Multi-step: data analysis",
    input: `A store's daily sales for a week: Mon=120, Tue=85, Wed=150, Thu=95, Fri=200, Sat=310, Sun=180. The store pays $50/day fixed cost plus 30% of sales as variable cost. On which day was the PROFIT (sales minus total cost) highest? Answer with just the day name.`,
    expectedAnswer: "Saturday",
    domain: "reasoning",
  },
  {
    id: "gt06_travel",
    description: "Multi-step: travel planning",
    input: `A train leaves City A at 9:00 AM traveling at 80 km/h toward City B. Another train leaves City B at 10:00 AM traveling at 120 km/h toward City A. Cities are 400 km apart. At what time do the trains meet? Answer in HH:MM format (24h).`,
    expectedAnswer: "11:30",
    domain: "reasoning",
  },
  {
    id: "gt07_recipe",
    description: "Multi-step: recipe scaling",
    input: `A recipe for 4 servings needs: 2 cups flour, 3 eggs, 1.5 cups milk, 0.5 cup sugar. You want to make 10 servings but only have 6 eggs. What is the maximum number of complete servings you can make? Answer with just the number.`,
    expectedAnswer: "8",
    domain: "reasoning",
  },
  {
    id: "gt08_code",
    description: "Multi-step: code tracing",
    input: `What does this Python code print?\nx = [1, 2, 3, 4, 5]\ny = [i**2 for i in x if i % 2 != 0]\nz = sum(y) - max(y)\nprint(z)\nAnswer with just the number.`,
    expectedAnswer: "10",
    domain: "code",
  },
  {
    id: "gt09_geography",
    description: "Multi-step: geographic reasoning",
    input: `You fly from New York (UTC-5) to London (UTC+0), the flight takes 7 hours. You depart at 6:00 PM local time. Then you take a 1-hour train to a meeting. What local time do you arrive at the meeting? Answer in HH:MM format (24h).`,
    expectedAnswer: "07:00",
    domain: "reasoning",
  },
  {
    id: "gt10_probability",
    description: "Multi-step: conditional probability",
    input: `A bag has 5 red, 3 blue, 2 green balls. You draw 2 balls without replacement. Given that the first ball is red, what is the probability the second ball is also red? Express as a simplified fraction. Answer like "X/Y".`,
    expectedAnswer: "4/9",
    domain: "math",
  },
];

export const gaiaTestTasks: Task[] = [
  {
    id: "gte01_budget",
    description: "Multi-step: budget optimization",
    input: `You have a $500 budget for a party. Venue costs $150. Food is $12/person. Drinks are $5/person. Entertainment is $80. You need at least 15 but want to maximize guests. What is the maximum number of guests? Answer with just the number.`,
    expectedAnswer: "15",
    domain: "reasoning",
  },
  {
    id: "gte02_cipher",
    description: "Multi-step: simple cipher",
    input: `Each letter is shifted by its position in the word (1st letter +1, 2nd +2, etc.). Decode "CKQOG" where you subtract the shift. What is the original word? Answer with just the word in lowercase.`,
    expectedAnswer: "blind",
    domain: "reasoning",
  },
  {
    id: "gte03_graph",
    description: "Multi-step: shortest path",
    input: `Cities connected by roads with distances: A-B=10, A-C=15, B-C=8, B-D=12, C-D=6, C-E=20, D-E=9. What is the shortest distance from A to E? Answer with just the number.`,
    expectedAnswer: "29",
    domain: "reasoning",
  },
  {
    id: "gte04_sequence",
    description: "Multi-step: pattern + arithmetic",
    input: `A sequence follows the rule: multiply by 2, then subtract 3. Starting from 5: 5, 7, 11, 19, 35, ... What is the sum of the first 6 terms? Answer with just the number.`,
    expectedAnswer: "144",
    domain: "math",
  },
  {
    id: "gte05_process",
    description: "Multi-step: process simulation",
    input: `A factory produces widgets. Machine A makes 10/hour. Machine B makes 15/hour but breaks down every 3 hours for 1 hour of repair. In an 8-hour shift, how many widgets does Machine B produce? Answer with just the number.`,
    expectedAnswer: "90",
    domain: "reasoning",
  },
];
