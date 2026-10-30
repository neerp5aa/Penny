import type { LessonTrack } from "@/lib/api";

/**
 * Lesson content, keyed by the lesson ids the API owns (it awards the XP). Facts are general
 * Canadian education current to 2026, not personal tax, credit, or investment advice.
 */
export type LessonContent = {
  summary: string;
  points: string[];
  quiz: { question: string; options: string[]; answer: number; why: string }[];
};

export const TRACKS: { id: LessonTrack; label: string; blurb: string }[] = [
  { id: "budgeting", label: "Budgeting", blurb: "Plan money before it’s spent." },
  { id: "saving", label: "Saving", blurb: "Build a cushion that lasts." },
  { id: "tax", label: "Tax", blurb: "How Canadian income tax really works." },
  { id: "credit", label: "Credit", blurb: "Use credit without it using you." },
  { id: "investing", label: "Investing", blurb: "Grow money for the long run." },
];

export const LESSON_CONTENT: Record<string, LessonContent> = {
  "budget-basics": {
    summary: "A budget is just a plan for your money before you spend it.",
    points: [
      "Start with what comes in, take out your fixed costs, then split the rest between flexible spending and savings.",
      "“Give every dollar a job” means each dollar has a purpose, even if that purpose is fun.",
      "Check in weekly. When you overspend, adjust the plan instead of abandoning it.",
    ],
    quiz: [
      { question: "What does “give every dollar a job” mean?", options: ["Plan where each dollar goes before you spend it", "Spend everything you earn each month", "Only track big purchases"], answer: 0, why: "A plan up front makes trade-offs visible before money is gone." },
      { question: "You overspend on food one week. What’s the best move?", options: ["Rebalance: take a little from another category", "Give up on budgeting", "Ignore it until next month"], answer: 0, why: "Budgets are meant to flex. Moving money between categories keeps the plan honest." },
    ],
  },
  "needs-vs-wants": {
    summary: "Needs keep life running. Wants make it nicer. Both belong in a budget.",
    points: [
      "Needs: housing, groceries, transit, a basic phone plan, tuition, prescriptions.",
      "Wants: takeout, coffee runs, streaming, concerts, upgrades.",
      "The 50/30/20 idea is a starting point: about 50% needs, 30% wants, 20% savings. Students often adjust it.",
    ],
    quiz: [
      { question: "Which of these is usually a want?", options: ["A café latte", "Rent", "A transit pass"], answer: 0, why: "Coffee out is nice to have; rent and getting to class aren’t optional." },
      { question: "In 50/30/20, what is the 20% for?", options: ["Savings and paying down debt", "Wants", "Rent"], answer: 0, why: "The 20% is your future self’s share." },
    ],
  },
  "fixed-vs-flexible": {
    summary: "Fixed costs repeat at the same amount. Flexible costs move with your choices.",
    points: [
      "Fixed: rent, phone plan, transit pass, subscriptions. They happen whatever you do.",
      "Flexible: groceries, eating out, fun. These are where day-to-day choices show up.",
      "Cutting a fixed cost once saves money every month, which is why reviewing subscriptions works so well.",
    ],
    quiz: [
      { question: "Which is a fixed cost?", options: ["Your monthly phone plan", "Groceries", "Movie night"], answer: 0, why: "It’s the same charge every month regardless of your choices." },
      { question: "Why does cancelling a $15-a-month subscription matter?", options: ["It saves $180 every year", "It doesn’t really matter", "It raises your credit score"], answer: 0, why: "Fixed savings repeat: $15 × 12 months is $180." },
    ],
  },
  "emergency-fund": {
    summary: "An emergency fund turns a surprise into an inconvenience instead of debt.",
    points: [
      "It covers the unexpected: a lost shift, a laptop repair, a last-minute flight home.",
      "A common target is 3 to 6 months of essential costs. Start with a first milestone like $500 or $1,000.",
      "Keep it in a separate, easy-to-reach savings account, not invested in the market.",
    ],
    quiz: [
      { question: "Where should an emergency fund usually live?", options: ["A high-interest savings account", "Individual stocks", "A credit card limit"], answer: 0, why: "It needs to be safe and available the day you need it." },
      { question: "What’s a sensible first milestone?", options: ["A smaller target like $500–$1,000", "Wait until you can save six months at once", "Skip it and use a credit card"], answer: 0, why: "Small wins build the habit, and even $500 covers many surprises." },
    ],
  },
  "pay-yourself-first": {
    summary: "Save the moment money arrives, not whatever’s left at the end of the month.",
    points: [
      "On payday, move your savings amount out before you start spending.",
      "Automate it with a scheduled transfer so willpower isn’t involved.",
      "Even a small amount builds the habit; raise it when your income rises.",
    ],
    quiz: [
      { question: "“Pay yourself first” means…", options: ["Saving as soon as income arrives", "Treating yourself before paying bills", "Paying bills late"], answer: 0, why: "Savings come off the top, so they actually happen." },
      { question: "What makes saving most likely to stick?", options: ["An automatic transfer on payday", "Saving whatever is left at month-end", "Only saving windfalls"], answer: 0, why: "Automation removes the decision each month." },
    ],
  },
  "tax-basics": {
    summary: "Canada taxes income in brackets, federally and provincially.",
    points: [
      "Rates rise in brackets, but only the income above each threshold is taxed at the higher rate.",
      "Your employer withholds tax from each paycheque and reports it on a T4 slip.",
      "You file a return each spring, usually by April 30. If too much was withheld, you get a refund.",
    ],
    quiz: [
      { question: "Moving into a higher tax bracket means…", options: ["Only income above the threshold is taxed at the higher rate", "All your income is taxed at the higher rate", "You take home less money overall"], answer: 0, why: "Brackets are marginal. A raise never lowers your take-home pay." },
      { question: "Which slip summarizes your job income and tax withheld?", options: ["T4", "T2202", "RRSP receipt"], answer: 0, why: "Employers issue a T4 by the end of February." },
    ],
  },
  "student-tax": {
    summary: "Filing as a student is often worth it, even with a small income.",
    points: [
      "Eligible tuition can earn a tax credit. Your school issues a T2202 slip.",
      "Filing can unlock benefits like the GST/HST credit, and earned income builds RRSP room.",
      "Tuition credits you can’t use yet can be carried forward to future years.",
    ],
    quiz: [
      { question: "Why file a return even with little income?", options: ["To get credits like the GST/HST credit and build RRSP room", "It’s pointless with low income", "It lowers your credit score"], answer: 0, why: "Many benefits are only paid if you file." },
      { question: "Which slip shows eligible tuition?", options: ["T2202", "T4", "T5"], answer: 0, why: "Your college or university issues the T2202." },
    ],
  },
  "credit-utilization": {
    summary: "Utilization is how much of your available credit you’re using.",
    points: [
      "It’s your balance divided by your limit. $300 on a $1,000 limit is 30%.",
      "Many Canadian credit-education guides suggest staying under 30%.",
      "Paying before your statement date lowers the balance that gets reported.",
    ],
    quiz: [
      { question: "A $300 balance on a $1,000 limit is what utilization?", options: ["30%", "3%", "300%"], answer: 0, why: "300 ÷ 1,000 = 0.30." },
      { question: "Which lowers utilization?", options: ["Paying down the balance", "Spending more on the card", "Closing your only card"], answer: 0, why: "A smaller balance on the same limit means lower utilization." },
    ],
  },
  "card-interest": {
    summary: "Credit cards are free to use only if you pay in full.",
    points: [
      "Pay the full statement balance by the due date and you usually pay no interest on purchases.",
      "Carry a balance and interest is charged, often around 20% a year. Minimum payments mostly cover interest.",
      "Cash advances usually charge interest from the day you take them.",
    ],
    quiz: [
      { question: "How do you avoid interest on purchases?", options: ["Pay the full statement balance by the due date", "Pay the minimum", "Pay a few days late"], answer: 0, why: "The grace period only applies when you pay in full." },
      { question: "Paying only the minimum mostly…", options: ["Keeps the debt around much longer", "Clears it quickly", "Lowers your interest rate"], answer: 0, why: "Most of a minimum payment goes to interest, not the balance." },
    ],
  },
  "investing-basics": {
    summary: "Investing trades certainty for the chance of growth over time.",
    points: [
      "Stocks are small pieces of companies. Bonds are loans to governments or companies.",
      "Higher potential returns come with bigger ups and downs.",
      "Compounding means your returns start earning returns. Time is the biggest ingredient.",
    ],
    quiz: [
      { question: "Compounding means…", options: ["Earning returns on past returns", "Paying interest twice", "A guaranteed return"], answer: 0, why: "Growth builds on growth, which is why starting early matters." },
      { question: "Money you need next year is usually best kept…", options: ["In savings", "In stocks", "In a single company"], answer: 0, why: "Short timelines don’t leave room to recover from a drop." },
    ],
  },
  "registered-accounts": {
    summary: "TFSAs, RRSPs, and FHSAs are tax-advantaged containers, not investments themselves.",
    points: [
      "TFSA: growth and withdrawals are tax-free; the 2026 limit is $7,000 and withdrawn room comes back next year.",
      "RRSP: contributions are deductible now and taxed when withdrawn; room is 18% of earned income, up to $33,810 in 2026.",
      "FHSA: for a first home. It’s deductible and tax-free for a qualifying purchase, at $8,000 a year and $40,000 lifetime.",
    ],
    quiz: [
      { question: "Which account gives you back withdrawn room the next year?", options: ["TFSA", "RRSP", "Neither"], answer: 0, why: "TFSA withdrawals are added back to your room on January 1." },
      { question: "What is the FHSA’s annual limit?", options: ["$8,000", "$7,000", "$33,810"], answer: 0, why: "$8,000 a year, up to $40,000 over your lifetime." },
    ],
  },
  "fees-diversification": {
    summary: "Low fees and wide diversification are two things you can actually control.",
    points: [
      "A fund’s MER is its yearly fee as a percentage of your money, taken every year.",
      "Broad index funds and ETFs often charge well under 1%, while some funds charge 2% or more.",
      "Diversification spreads money across many companies and countries so no single one sinks you.",
    ],
    quiz: [
      { question: "Over decades, a 2% fee instead of 0.25%…", options: ["Can cost thousands of dollars", "Makes no real difference", "Is always worth it"], answer: 0, why: "Fees compound against you, just like returns compound for you." },
      { question: "Diversification means…", options: ["Spreading money across many investments", "Buying one hot stock", "Timing the market"], answer: 0, why: "Many holdings means less riding on any single one." },
    ],
  },
};
