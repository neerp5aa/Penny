"""Lesson content and answer keys. Server-side only, so the client never sees the answers.

Facts are general education current to 2026 (CRA, IRS, CDIC, FDIC, Criminal Code s. 347),
not personal tax, credit, legal, or investment advice. Calculation questions use the numbers
given in the question, or made-up brackets, so they test reasoning rather than memory.
"""

from dataclasses import dataclass
from typing import Literal

Country = Literal["CA", "US"]
Topic = Literal["budgeting", "saving", "tax", "credit", "rules", "investing"]
Tier = Literal["easy", "medium", "hard"]
QuestionKind = Literal["choice", "multi", "number", "order"]
Unit = Literal["$", "%", "years", ""]

TIERS: tuple[Tier, ...] = ("easy", "medium", "hard")
TOPICS: tuple[tuple[Topic, str, str], ...] = (
    ("budgeting", "Budgeting", "Plan money before it’s spent."),
    ("saving", "Saving", "Build a cushion and reach goals."),
    ("tax", "Tax", "How income tax actually works."),
    ("credit", "Credit", "Use credit without it using you."),
    ("rules", "Rules & rights", "The laws that protect your money."),
    ("investing", "Investing", "Grow money for the long run."),
)


@dataclass(frozen=True)
class Option:
    id: str
    text: str


@dataclass(frozen=True)
class Question:
    id: str
    kind: QuestionKind
    prompt: str
    explanation: str
    options: tuple[Option, ...] = ()
    # Option ids: the one right choice, every right choice (multi), or the right sequence (order).
    answer: tuple[str, ...] = ()
    number: str | None = None  # exact expected value for "number" questions
    tolerance: str = "0"
    unit: Unit = ""


@dataclass(frozen=True)
class Task:
    label: str
    view: Literal["spending", "goals", "invest", "ai", "settings"]
    prompt: str | None = None  # for Penny AI tasks: the question to ask on the learner's behalf


@dataclass(frozen=True)
class LessonContent:
    id: str
    topic: Topic
    tier: Tier
    country: Country | None  # None: the same lesson for every country
    title: str
    summary: str
    cards: tuple[str, ...]
    questions: tuple[Question, ...]
    task: Task | None = None


# ------------------------------------------------------------------ compact builders


def _options(qid: str, texts: list[str]) -> tuple[Option, ...]:
    return tuple(Option(f"{qid}-{index}", text) for index, text in enumerate(texts))


def choice(qid: str, prompt: str, right: str, wrong: list[str], why: str) -> Question:
    options = _options(qid, [right, *wrong])
    return Question(qid, "choice", prompt, why, options, (options[0].id,))


def multi(qid: str, prompt: str, right: list[str], wrong: list[str], why: str) -> Question:
    options = _options(qid, [*right, *wrong])
    return Question(qid, "multi", prompt, why, options, tuple(o.id for o in options[: len(right)]))


def order(qid: str, prompt: str, steps: list[str], why: str) -> Question:
    options = _options(qid, steps)
    return Question(qid, "order", prompt, why, options, tuple(o.id for o in options))


def number(
    qid: str, prompt: str, value: str, why: str, unit: Unit = "$", tolerance: str = "0"
) -> Question:
    return Question(qid, "number", prompt, why, number=value, unit=unit, tolerance=tolerance)


# ------------------------------------------------------------------ budgeting (all countries)

BUDGETING = (
    LessonContent(
        "budgeting-easy",
        "budgeting",
        "easy",
        None,
        "Build your first budget",
        "A plan for your money before you spend it.",
        (
            "A budget is a plan made before the money is spent. Start with what comes in, take "
            "out fixed costs, then split what’s left between flexible spending and savings.",
            "Fixed costs repeat at about the same amount whatever you do: rent, a phone plan, a "
            "transit pass. Flexible costs (groceries, eating out, fun) move with your daily "
            "choices, so that’s where a budget usually finds room.",
            "The 50/30/20 guideline is a starting point: about 50% of take-home pay for needs, "
            "30% for wants, and 20% for savings and extra debt payments. Use take-home pay, the "
            "amount that actually lands in your account after deductions.",
            "When you overspend in one category, move money from another one instead of "
            "abandoning the plan. A budget that bends is a budget you keep.",
        ),
        (
            choice(
                "q1",
                "Which of these is a fixed cost?",
                "A monthly phone plan",
                ["Groceries", "Concert tickets", "Takeout on Fridays"],
                "A phone plan costs about the same every month whatever you do. The others "
                "change with your choices, so they’re flexible.",
            ),
            number(
                "q2",
                "Your take-home pay is $2,400 a month. Using 50/30/20, how much goes to savings "
                "and extra debt payments each month?",
                "480",
                "20% of $2,400 is $480.",
            ),
            choice(
                "q3",
                "Your pay is $3,000 before deductions, and $2,550 lands in your account. Which "
                "number should 50/30/20 use?",
                "$2,550, your take-home pay",
                ["$3,000, your gross pay", "The average of the two", "Whichever is bigger"],
                "Budgets work with money you can actually spend, which is take-home pay.",
            ),
            choice(
                "q4",
                "You’re $40 over on eating out with a week left in the month. What does a good "
                "budget do?",
                "Move $40 from another flexible category, like fun",
                [
                    "Give up on the budget until next month",
                    "Put it on a credit card and forget about it",
                    "Cut groceries to zero for the week",
                ],
                "Rebalancing keeps the plan honest. Abandoning it or skipping essentials doesn’t.",
            ),
        ),
        Task("Set a budget for one flexible category in Spending", "spending"),
    ),
    LessonContent(
        "budgeting-medium",
        "budgeting",
        "medium",
        None,
        "Make the numbers work",
        "Zero-based budgets, sinking funds, and percentages.",
        (
            "Zero-based budgeting gives every dollar a job: income minus all planned spending "
            "and saving should equal $0. “Savings” counts as a job.",
            "Irregular costs (textbooks each term, a yearly subscription, gifts in December) "
            "break monthly budgets. Divide the yearly cost by 12 and set that much aside every "
            "month. That’s a sinking fund.",
            "Track shares, not just dollars: a category’s share of spending = category "
            "spending ÷ total spending × 100.",
            "Lifestyle creep: when income rises, spending quietly rises with it. Deciding in "
            "advance where a raise goes (for example, half to savings) protects it.",
        ),
        (
            number(
                "q1",
                "Textbooks cost about $540 a year. How much should a sinking fund set aside each "
                "month?",
                "45",
                "$540 ÷ 12 months = $45 a month.",
            ),
            number(
                "q2",
                "Income is $1,800. Planned: rent $900, groceries $300, transit $100, phone $50, "
                "fun $150. Under zero-based budgeting, how many dollars still need a job?",
                "300",
                "$900 + $300 + $100 + $50 + $150 = $1,500, so $300 still needs a job. Savings "
                "is a good one.",
            ),
            number(
                "q3",
                "You spent $1,250 this month, $250 of it on eating out. What percent of your "
                "spending went to eating out?",
                "20",
                "$250 ÷ $1,250 × 100 = 20%.",
                unit="%",
            ),
            multi(
                "q4",
                "Which are good candidates for a sinking fund? Select all that apply.",
                ["Annual car insurance", "Holiday gifts in December", "Textbooks each September"],
                ["Weekly groceries", "Monthly rent"],
                "Sinking funds smooth out costs that don’t arrive every month. Groceries and "
                "rent are already monthly.",
            ),
            choice(
                "q5",
                "You get a $200-a-month raise. Which plan best avoids lifestyle creep?",
                "Decide now: $100 to savings and $100 to spending",
                [
                    "Spend it and see what’s left",
                    "Wait until the end of the year to decide",
                    "Upgrade your phone plan first since it’s only $50 more",
                ],
                "Deciding before the money arrives is what stops it disappearing into spending.",
            ),
        ),
        Task("Start a goal for a yearly cost in Goals", "goals"),
    ),
    LessonContent(
        "budgeting-hard",
        "budgeting",
        "hard",
        None,
        "Budget under pressure",
        "Weekly-to-monthly maths, priorities, and trade-offs.",
        (
            "To turn a weekly cost into a monthly one, multiply by 52 and divide by 12, not by "
            "4. A month is about 4.33 weeks, so “× 4” undercounts.",
            "Cutting a fixed cost saves every month automatically. Cutting a flexible cost "
            "needs a new decision every time. Cancelling a $15-a-month subscription saves $180 "
            "a year with no willpower at all.",
            "When money is short, pay in this order: essentials that keep you housed, fed, and "
            "able to get to work or school; then minimum debt payments, because missing them "
            "adds fees and hurts your credit; then everything else.",
            "A surprise expense isn’t a failure, it’s information. Cover it this month and add "
            "a line for it to next month’s plan.",
        ),
        (
            number(
                "q1",
                "You spend $30 a week on coffee. Using 52 weeks ÷ 12 months, how much is that "
                "per month?",
                "130",
                "$30 × 52 = $1,560 a year, and $1,560 ÷ 12 = $130 a month.",
            ),
            number(
                "q2",
                "Your plan allows $240 a month for groceries (4 weeks × $60). Using 52 ÷ 12, how "
                "many dollars short is it each month? Round to the nearest dollar.",
                "20",
                "$60 × 52 ÷ 12 = $260 a month, so the plan is $20 short.",
                tolerance="0.5",
            ),
            order(
                "q3",
                "Money is short this month. Put these in the order you’d pay them, first to last.",
                ["Rent", "Minimum credit card payment", "Concert tickets"],
                "Housing first, then minimum debt payments to avoid fees and credit damage, "
                "then wants.",
            ),
            choice(
                "q4",
                "Which saves the most over a year?",
                "Cancel a $15-a-month subscription",
                [
                    "Skip one $5 coffee every two weeks",
                    "Save $2 on each of 50 grocery trips",
                    "Use a $25 coupon twice a year",
                ],
                "$15 × 12 = $180. The others: $5 × 26 = $130, $2 × 50 = $100, $25 × 2 = $50.",
            ),
            choice(
                "q5",
                "An unexpected $120 vet bill hit this month. What’s the best budgeting response?",
                "Cover it from flexible categories now and add a pet line to next month’s plan",
                [
                    "Count the month as failed and stop tracking",
                    "Ignore it since it was a one-off",
                    "Take it out of next month’s rent money",
                ],
                "Rebalance now, then plan for it. Rent money is for rent.",
            ),
        ),
        Task("Review your flexible spending in Spending", "spending"),
    ),
)

# ------------------------------------------------------------------ saving (all countries)

SAVING = (
    LessonContent(
        "saving-easy",
        "saving",
        "easy",
        None,
        "Start saving",
        "Pay yourself first and build an emergency cushion.",
        (
            "Pay yourself first: move money to savings as soon as you’re paid, before spending. "
            "Automating the transfer means you never have to remember.",
            "An emergency fund covers surprises, like a phone repair or a missed shift. A common "
            "target is 3 to 6 months of essential expenses. Start with a smaller first "
            "milestone, like $500 or $1,000.",
            "Keep emergency money somewhere safe and quick to reach, separate from your "
            "everyday account so it doesn’t get spent by accident.",
            "Small amounts add up: $25 a week is $1,300 a year, because a year has 52 weeks.",
        ),
        (
            choice(
                "q1",
                "What does “pay yourself first” mean?",
                "Move money to savings as soon as you’re paid",
                [
                    "Buy something for yourself before paying bills",
                    "Save whatever is left at the end of the month",
                    "Pay your own debts before anyone else’s",
                ],
                "Saving first, ideally automatically, means savings don’t depend on leftovers.",
            ),
            number(
                "q2",
                "You save $20 every week for a year. How much do you have after 52 weeks?",
                "1040",
                "$20 × 52 = $1,040.",
            ),
            number(
                "q3",
                "Your essential expenses are $1,200 a month. How big is a 3-month emergency fund?",
                "3600",
                "$1,200 × 3 = $3,600.",
            ),
            choice(
                "q4",
                "Where should an emergency fund usually live?",
                "A separate savings account you can reach quickly",
                [
                    "Shares of a single company",
                    "Your everyday spending account",
                    "Lent to a friend who’ll pay it back later",
                ],
                "Emergency money needs to be safe and reachable, and kept apart so it isn’t "
                "spent by accident.",
            ),
        ),
        Task("Add money to your emergency fund in Goals", "goals"),
    ),
    LessonContent(
        "saving-medium",
        "saving",
        "medium",
        None,
        "Interest and goals",
        "How savings grow, and how to plan a goal.",
        (
            "Interest is what a bank pays you to hold your money. Yearly interest ≈ balance × "
            "annual rate. $1,000 at 3% earns about $30 in a year.",
            "A savings goal needs an amount, a date, and a monthly figure. Monthly saving = "
            "amount still needed ÷ months left.",
            "Compounding means interest earns interest. The longer money sits, the faster it "
            "grows, so starting early matters more than starting big.",
            "Inflation shrinks what money buys. If prices rise 3% a year and your savings earn "
            "1%, your money buys about 2% less each year.",
        ),
        (
            number(
                "q1",
                "You want $1,200 for a laptop in 8 months and already have $400. How much do you "
                "need to save each month?",
                "100",
                "$1,200 − $400 = $800 still needed, and $800 ÷ 8 = $100 a month.",
            ),
            number(
                "q2",
                "$2,000 sits in a savings account paying 4% a year. About how much interest does "
                "it earn in one year?",
                "80",
                "$2,000 × 4% = $80.",
            ),
            choice(
                "q3",
                "Prices rise 3% this year. Your savings earn 1%. What happens to what your "
                "savings can buy?",
                "It falls by about 2%",
                ["It rises by about 1%", "It stays the same", "It falls by about 4%"],
                "Real growth ≈ interest − inflation = 1% − 3% = −2%.",
            ),
            choice(
                "q4",
                "Ana and Ben each save $100 a month at the same rate and both stop at 60. Ana "
                "starts at 20, Ben at 30. Who most likely ends up with more?",
                "Ana, because her money compounds for ten more years",
                [
                    "Ben, because he starts with a bigger income",
                    "Exactly the same, since they save the same amount",
                    "Ben, because recent money grows faster",
                ],
                "Ana contributes more and, more importantly, gives compounding ten more years.",
            ),
            number(
                "q5",
                "Your goal is $900 in 6 months, starting from $0, but you can only save $120 a "
                "month. How many dollars short will you be at the deadline?",
                "180",
                "$120 × 6 = $720, and $900 − $720 = $180 short. Extend the date or find $30 more "
                "a month.",
            ),
        ),
        Task("Check your goal’s monthly plan in Goals", "goals"),
    ),
    LessonContent(
        "saving-hard",
        "saving",
        "hard",
        None,
        "Savings strategist",
        "Compounding, the Rule of 72, and real returns.",
        (
            "Yearly compounding: new balance = old balance × (1 + rate). $1,000 at 10% becomes "
            "$1,100 after one year and $1,210 after two.",
            "Rule of 72: years to double ≈ 72 ÷ the annual rate in percent. At 6%, about 12 "
            "years. It’s an estimate, not a promise.",
            "Real return ≈ interest rate − inflation rate.",
            "Paying off debt is a guaranteed “return” equal to its interest rate. Once you have "
            "a small emergency cushion, paying down a 20% card beats a 4% savings account.",
        ),
        (
            number(
                "q1",
                "$500 grows at 10% a year, compounding yearly. What’s the balance after 2 years?",
                "605",
                "$500 × 1.10 = $550, then $550 × 1.10 = $605.",
            ),
            number(
                "q2",
                "Using the Rule of 72, about how many years does money take to double at 8%?",
                "9",
                "72 ÷ 8 = 9 years.",
                unit="years",
            ),
            number(
                "q3",
                "Savings pay 4.5% and inflation is 2.5%. What’s the approximate real return?",
                "2",
                "4.5% − 2.5% = 2%.",
                unit="%",
            ),
            choice(
                "q4",
                "You have a $1,000 emergency cushion plus $600 extra. Your card charges 21%; "
                "savings pay 4%. What’s the best use of the $600?",
                "Pay down the card, which is like earning 21%",
                [
                    "Savings, because it’s safer",
                    "Split it evenly to stay balanced",
                    "Keep it as cash at home",
                ],
                "With a cushion in place, removing 21% interest beats earning 4%.",
            ),
            multi(
                "q5",
                "Which statements are true? Select all that apply.",
                [
                    "At 6%, money roughly doubles in 12 years",
                    "Compounding means interest earns interest",
                ],
                [
                    "The Rule of 72 guarantees when money doubles",
                    "A 2% real return means prices fell 2%",
                ],
                "72 ÷ 6 = 12, and compounding is interest on interest. The rule is only an "
                "estimate, and real return compares growth with inflation.",
            ),
        ),
        Task(
            "Ask Penny AI how long your goals will take",
            "ai",
            "How long will my savings goals take at my current pace?",
        ),
    ),
)

# ------------------------------------------------------------------ tax

TAX_CA = (
    LessonContent(
        "ca-tax-easy",
        "tax",
        "easy",
        "CA",
        "How income tax works in Canada",
        "Brackets, slips, and the April 30 deadline.",
        (
            "The Canada Revenue Agency (CRA) collects federal income tax, and your province or "
            "territory adds its own. Most people file one return that covers both.",
            "Canada uses tax brackets. A higher rate applies only to the part of your income "
            "inside the higher bracket, so a raise never lowers your take-home pay.",
            "For 2026 the lowest federal rate is 14%, and the basic personal amount means "
            "roughly the first $16,452 of income has no federal tax.",
            "Employers take income tax, CPP contributions, and EI premiums off each paycheque. "
            "Your T4 slip shows the year’s totals. Most people must file by April 30.",
        ),
        (
            choice(
                "q1",
                "A raise pushes part of your income into a higher bracket. What happens?",
                "Only the income above the threshold is taxed at the higher rate",
                [
                    "All of your income is taxed at the higher rate",
                    "Your take-home pay can go down",
                    "The higher rate only starts next year",
                ],
                "Brackets apply slice by slice, so earning more always leaves you with more.",
            ),
            choice(
                "q2",
                "Which slip shows your employment income and what was taken off your pay?",
                "T4",
                ["T2202", "T4A", "An RRSP receipt"],
                "The T4 reports employment income and deductions. T4A covers things like "
                "scholarships; T2202 is for tuition.",
            ),
            choice(
                "q3",
                "When is the usual personal tax filing deadline in Canada?",
                "April 30",
                ["April 15", "June 15 for everyone", "December 31"],
                "April 30 for most people. April 15 is the US deadline.",
            ),
            multi(
                "q4",
                "Which are commonly taken off a Canadian paycheque? Select all that apply.",
                ["Income tax", "CPP contributions", "EI premiums"],
                ["GST on your wages", "A required TFSA contribution"],
                "Income tax, CPP, and EI are payroll deductions. GST isn’t charged on wages, and "
                "TFSAs are always optional.",
            ),
        ),
        Task(
            "Ask Penny AI which income slips to watch for",
            "ai",
            "Which income slips should I expect at tax time in Canada?",
        ),
    ),
    LessonContent(
        "ca-tax-medium",
        "tax",
        "medium",
        "CA",
        "Taxes as a student in Canada",
        "Filing, tuition credits, scholarships, and refunds.",
        (
            "File even with little or no income. Filing builds RRSP room and can unlock benefits "
            "like the GST/HST credit, paid quarterly to people with lower incomes.",
            "Tuition from a qualifying school appears on a T2202. It gives a non-refundable "
            "credit: it can lower tax you owe but won’t pay out cash by itself. Unused federal "
            "tuition amounts can be carried forward to future years.",
            "Scholarships and bursaries are reported on a T4A. For full-time students eligible "
            "for the education amount, they’re usually tax-free.",
            "A refund means more tax was withheld than you owed. It’s your own money coming "
            "back, not a bonus. Rough federal tax in the lowest bracket ≈ (income − $16,452) × "
            "14%.",
        ),
        (
            number(
                "q1",
                "Using (income − $16,452) × 14%: Sam earns $20,452. Roughly how much federal tax "
                "is that, before other credits?",
                "560",
                "$20,452 − $16,452 = $4,000, and $4,000 × 14% = $560.",
            ),
            choice(
                "q2",
                "Why should a student who earned only $3,000 still file a return?",
                "It can unlock benefits like the GST/HST credit and builds RRSP room",
                [
                    "It’s needed before your employer can issue a T4",
                    "It raises your credit score",
                    "Tax is always owed on any income",
                ],
                "Filing is how the CRA knows you qualify for benefits and how RRSP room is set.",
            ),
            choice(
                "q3",
                "Your tuition credit is bigger than the federal tax you owe this year. What "
                "happens to the unused part?",
                "It can be carried forward to future years",
                [
                    "The CRA pays it out as cash",
                    "It disappears at the end of the year",
                    "It’s added to your TFSA room",
                ],
                "Non-refundable credits don’t pay cash, but unused federal tuition amounts carry "
                "forward.",
            ),
            choice(
                "q4",
                "A full-time student gets a $2,000 scholarship. Which slip reports it, and is it "
                "usually taxed?",
                "T4A, and it’s usually tax-free if they qualify for the education amount",
                [
                    "T4, and it’s taxed like wages",
                    "T2202, and it’s always taxed",
                    "No slip, and it must be reported as a gift",
                ],
                "Scholarships go on a T4A and are usually exempt for full-time students.",
            ),
            choice(
                "q5",
                "You got a $400 refund. What does that mean?",
                "Too much tax was withheld during the year",
                [
                    "The government gave you a bonus",
                    "You’ll owe $400 next year",
                    "Your tax rate was 0%",
                ],
                "A refund returns overpaid tax. Nothing extra was earned.",
            ),
        ),
        Task(
            "Ask Penny AI what filing as a student involves",
            "ai",
            "What does filing a tax return as a student in Canada involve?",
        ),
    ),
    LessonContent(
        "ca-tax-hard",
        "tax",
        "hard",
        "CA",
        "Marginal vs average tax (Canada)",
        "Work through brackets, deductions, and credits.",
        (
            "Your marginal rate is the rate on your next dollar. Your average rate is total tax "
            "÷ total income. When brackets rise, the average is lower than the marginal rate.",
            "Work through brackets one slice at a time. Made-up example: 10% on the first "
            "$10,000 and 20% above that. Earning $15,000 means $1,000 + $1,000 = $2,000 of tax, "
            "an average rate of 13.3%.",
            "Deductions, like RRSP contributions, reduce taxable income, so they save tax at "
            "your marginal rate. Credits reduce the tax itself by a set amount.",
            "Filing late when you owe costs 5% of the balance owing, plus 1% for each full "
            "month late, up to 12 months.",
        ),
        (
            number(
                "q1",
                "Made-up brackets: 10% on the first $10,000 and 20% above that. How much tax is "
                "owed on $18,000?",
                "2600",
                "$10,000 × 10% = $1,000, plus $8,000 × 20% = $1,600, for $2,600.",
            ),
            number(
                "q2",
                "$2,600 of tax on $18,000 of income. What’s the average tax rate, to one decimal "
                "place?",
                "14.4",
                "$2,600 ÷ $18,000 = 14.4%, well below the 20% marginal rate.",
                unit="%",
                tolerance="0.05",
            ),
            number(
                "q3",
                "Your marginal rate is 20%. About how much tax does a $1,000 RRSP deduction save?",
                "200",
                "Deductions save tax at your marginal rate: $1,000 × 20% = $200.",
            ),
            number(
                "q4",
                "You owe $1,000 and file 3 full months late. What’s the late-filing penalty?",
                "80",
                "5% × $1,000 = $50, plus 1% × $1,000 × 3 months = $30, for $80.",
            ),
            choice(
                "q5",
                "Someone in a 30% bracket owes plenty of tax. Which saves more: a $500 deduction "
                "or a $200 non-refundable credit?",
                "The $200 credit",
                ["The $500 deduction", "They save the same", "Neither saves anything"],
                "The deduction saves $500 × 30% = $150. The credit cuts tax by the full $200.",
            ),
        ),
        Task(
            "Ask Penny AI to explain your marginal rate",
            "ai",
            "Can you explain marginal vs average tax rates with an example?",
        ),
    ),
)

TAX_US = (
    LessonContent(
        "us-tax-easy",
        "tax",
        "easy",
        "US",
        "How income tax works in the US",
        "Brackets, the standard deduction, and FICA.",
        (
            "The IRS collects federal income tax. Most states add their own income tax, though "
            "a few have none.",
            "The US uses tax brackets from 10% to 37%. A higher rate applies only to income "
            "inside the higher bracket, so a raise never lowers your take-home pay.",
            "For 2026 the standard deduction for a single filer is $16,100. If you don’t "
            "itemize, that much of your income isn’t federally taxed.",
            "Employers withhold income tax plus FICA: 6.2% for Social Security and 1.45% for "
            "Medicare. Your W-2 shows the year’s totals; freelance income comes on a 1099. The "
            "usual filing deadline is April 15.",
        ),
        (
            choice(
                "q1",
                "A raise pushes part of your income into a higher bracket. What happens?",
                "Only the income above the threshold is taxed at the higher rate",
                [
                    "All of your income is taxed at the higher rate",
                    "Your take-home pay can go down",
                    "The higher rate only starts next year",
                ],
                "Brackets apply slice by slice, so earning more always leaves you with more.",
            ),
            choice(
                "q2",
                "Which form shows the wages and withholding from your employer?",
                "W-2",
                ["W-4", "1099-NEC", "1040-ES"],
                "The W-2 reports wages and withholding. The W-4 is the form you give your "
                "employer to set withholding.",
            ),
            choice(
                "q3",
                "When is the usual federal tax filing deadline in the US?",
                "April 15",
                ["April 30", "June 15", "December 31"],
                "April 15 in most years. April 30 is Canada’s deadline.",
            ),
            number(
                "q4",
                "What’s the combined FICA rate withheld from an employee’s pay?",
                "7.65",
                "6.2% Social Security + 1.45% Medicare = 7.65%.",
                unit="%",
                tolerance="0.001",
            ),
        ),
        Task(
            "Ask Penny AI what a W-2 shows",
            "ai",
            "What does a W-2 show, and how is it different from a 1099?",
        ),
    ),
    LessonContent(
        "us-tax-medium",
        "tax",
        "medium",
        "US",
        "Your first US tax return",
        "Withholding, deductions, and gig income.",
        (
            "Your W-4 tells your employer how much to withhold. Too little, and you owe in "
            "April; too much, and you get a refund.",
            "Take whichever is larger: the standard deduction ($16,100 for a single filer in "
            "2026) or your itemized deductions. Most young filers take the standard deduction.",
            "Taxable income = income − deductions. With only wages: wages − $16,100.",
            "Gig and freelance income (on a 1099) has no withholding. You pay income tax and "
            "self-employment tax yourself, often through quarterly estimated payments. A refund "
            "is just money you over-withheld.",
        ),
        (
            number(
                "q1",
                "A single filer earns $30,000 in wages and takes the $16,100 standard deduction. "
                "What’s their taxable income?",
                "13900",
                "$30,000 − $16,100 = $13,900.",
            ),
            choice(
                "q2",
                "You earned $4,000 delivering for an app and got a 1099. What’s true?",
                "Nothing was withheld, so you may owe income tax and self-employment tax",
                [
                    "It’s tax-free because it’s under $5,000",
                    "The app already withheld your tax",
                    "Only state tax applies to gig income",
                ],
                "1099 income has no withholding, so you handle the tax yourself.",
            ),
            choice(
                "q3",
                "Your itemized deductions add up to $9,000. What should a single filer do in 2026?",
                "Take the $16,100 standard deduction",
                ["Itemize the $9,000", "Claim both", "Claim neither"],
                "You take whichever is larger, and $16,100 beats $9,000.",
            ),
            choice(
                "q4",
                "You got a big refund and would rather have more in each paycheck. What do you "
                "update?",
                "Your W-4 with your employer",
                ["Your W-2", "A 1099", "Nothing; refunds can’t change"],
                "The W-4 controls withholding. The W-2 only reports what happened.",
            ),
            number(
                "q5",
                "Made-up rate: 10% on all taxable income. Wages are $20,100 and the standard "
                "deduction is $16,100. How much federal tax is owed?",
                "400",
                "Taxable income is $20,100 − $16,100 = $4,000, and $4,000 × 10% = $400.",
            ),
        ),
        Task(
            "Ask Penny AI what a W-4 changes",
            "ai",
            "What does changing my W-4 do to my paycheck and refund?",
        ),
    ),
    LessonContent(
        "us-tax-hard",
        "tax",
        "hard",
        "US",
        "Brackets, rates, and credits (US)",
        "Marginal vs average, deductions vs credits, pre-tax vs Roth.",
        (
            "Your marginal rate is the rate on your next dollar. Your average rate is total tax "
            "÷ total income, and it’s lower than the marginal rate when brackets rise.",
            "Work through brackets one slice at a time. Made-up example: 10% on the first "
            "$12,000 and 12% above that.",
            "Deductions reduce taxable income, so they save tax at your marginal rate. Credits "
            "cut the tax itself. Refundable credits can pay out even if you owe nothing.",
            "Pre-tax 401(k) contributions lower taxable income now. Roth contributions don’t, "
            "but qualified withdrawals later are tax-free.",
        ),
        (
            number(
                "q1",
                "Made-up brackets: 10% on the first $12,000 and 12% above that. How much tax is "
                "owed on $20,000 of taxable income?",
                "2160",
                "$12,000 × 10% = $1,200, plus $8,000 × 12% = $960, for $2,160.",
            ),
            number(
                "q2",
                "$2,160 of tax on $20,000. What’s the average tax rate, to one decimal place?",
                "10.8",
                "$2,160 ÷ $20,000 = 10.8%, below the 12% marginal rate.",
                unit="%",
                tolerance="0.05",
            ),
            number(
                "q3",
                "Your marginal rate is 12%. About how much tax does a $1,000 pre-tax 401(k) "
                "contribution save this year?",
                "120",
                "$1,000 × 12% = $120.",
            ),
            choice(
                "q4",
                "In a 22% bracket, which saves more: a $500 deduction or a $100 credit?",
                "The $500 deduction",
                ["The $100 credit", "They save the same", "Neither saves anything"],
                "The deduction saves $500 × 22% = $110, which beats the $100 credit.",
            ),
            choice(
                "q5",
                "You owe $0 in federal tax. Which can still put money in your pocket?",
                "A refundable credit",
                ["A non-refundable credit", "A deduction", "Nothing can"],
                "Only refundable credits pay out beyond the tax you owe.",
            ),
        ),
        Task(
            "Ask Penny AI about pre-tax vs Roth",
            "ai",
            "What’s the difference between pre-tax and Roth retirement contributions?",
        ),
    ),
)

# ------------------------------------------------------------------ credit

CREDIT_CA = (
    LessonContent(
        "ca-credit-easy",
        "credit",
        "easy",
        "CA",
        "Credit basics (Canada)",
        "Scores, utilization, and avoiding interest.",
        (
            "A credit score summarizes how you’ve handled credit. In Canada scores run from 300 "
            "to 900, and the two main credit bureaus are Equifax and TransUnion.",
            "Paying on time is the biggest factor. Even paying the minimum on time protects "
            "your history; missed payments hurt it.",
            "Credit utilization = balance ÷ limit. Many guides suggest staying under 30%.",
            "Pay the full statement balance by the due date and you pay no interest on "
            "purchases. Federally regulated lenders give at least a 21-day interest-free grace "
            "period on new purchases.",
        ),
        (
            choice(
                "q1",
                "What range do Canadian credit scores use?",
                "300 to 900",
                ["300 to 850", "0 to 100", "1 to 10"],
                "Canadian scores run 300 to 900. US FICO scores run 300 to 850.",
            ),
            number(
                "q2",
                "You have a $450 balance on a card with a $1,500 limit. What’s your utilization?",
                "30",
                "$450 ÷ $1,500 = 30%.",
                unit="%",
            ),
            choice(
                "q3",
                "Which does the most to build a strong score?",
                "Paying every bill on time",
                [
                    "Opening several cards at once",
                    "Carrying a balance to show activity",
                    "Checking your own score often",
                ],
                "Payment history matters most. Carrying a balance only costs interest.",
            ),
            choice(
                "q4",
                "How do you avoid interest on card purchases entirely?",
                "Pay the full statement balance by the due date",
                ["Pay the minimum on time", "Pay half the balance", "Pay just after the due date"],
                "Only a full payment by the due date keeps the grace period.",
            ),
        ),
        Task(
            "Ask Penny AI what your card utilization means",
            "ai",
            "What does my credit card utilization mean for my credit?",
        ),
    ),
    LessonContent(
        "ca-credit-medium",
        "credit",
        "medium",
        "CA",
        "The true cost of credit (Canada)",
        "Interest, cash advances, and your credit report.",
        (
            "Monthly interest ≈ balance × annual rate ÷ 12. Paying only the minimum can take "
            "years, because early payments mostly cover interest.",
            "Cash advances usually charge interest from day one, with no grace period, often at "
            "a higher rate plus a fee.",
            "You can get your credit report free from Equifax and TransUnion. Check it for "
            "errors and dispute anything that isn’t yours with the bureau.",
            "Applying for credit causes a hard inquiry that can dip your score slightly. "
            "Checking your own report doesn’t affect it.",
        ),
        (
            number(
                "q1",
                "A $1,200 card balance at 24% a year. About how much interest builds in one month?",
                "24",
                "$1,200 × 24% ÷ 12 = $24.",
            ),
            choice(
                "q2",
                "What’s usually true of a credit card cash advance?",
                "Interest starts right away, often at a higher rate",
                [
                    "It gets the same 21-day grace period as purchases",
                    "It doesn’t count as debt",
                    "It’s free if it’s under $100",
                ],
                "Cash advances skip the grace period and usually cost more.",
            ),
            choice(
                "q3",
                "Your credit report shows an account that isn’t yours. What should you do?",
                "Dispute it with the credit bureau",
                ["Ignore it", "Pay it off to be safe", "Close all your own accounts"],
                "Bureaus must look into disputes. An account you don’t recognize could be fraud.",
            ),
            multi(
                "q4",
                "Which can lower your credit score? Select all that apply.",
                ["Missing a payment", "Maxing out your card"],
                ["Checking your own credit report", "Paying in full every month"],
                "Late payments and high utilization hurt. Checking your own report and paying in "
                "full don’t.",
            ),
            choice(
                "q5",
                "You apply for five cards in one month. What’s the likely effect?",
                "Each application can be a hard inquiry that dips your score",
                [
                    "Nothing, since applying is free",
                    "Your score rises because you have more credit",
                    "Only the approved cards show up",
                ],
                "Several hard inquiries close together can signal risk to lenders.",
            ),
        ),
        Task(
            "Ask Penny AI how interest would grow on your card",
            "ai",
            "How much interest would my card balance cost if I only paid the minimum?",
        ),
    ),
    LessonContent(
        "ca-credit-hard",
        "credit",
        "hard",
        "CA",
        "Credit strategist (Canada)",
        "Overall utilization, paying down debt, and borrowing limits.",
        (
            "Utilization counts per card and overall. Overall = total balances ÷ total limits.",
            "Avalanche: put extra money on the highest-rate debt first, which saves the most "
            "interest. Snowball: put it on the smallest balance first for quick wins.",
            "Since January 1, 2025, it’s a crime in Canada to charge more than 35% APR on most "
            "loans. Payday loans are regulated separately and are still very expensive.",
            "Missed payments and other negative information generally stay on a Canadian credit "
            "report for about six years.",
        ),
        (
            number(
                "q1",
                "Card A: $300 of a $1,000 limit. Card B: $200 of a $4,000 limit. What’s your "
                "overall utilization?",
                "10",
                "$500 in balances ÷ $5,000 in limits = 10%.",
                unit="%",
            ),
            choice(
                "q2",
                "Debts: store card $1,500 at 29.99%, credit card $300 at 19.99%, line of credit "
                "$2,000 at 9%. With the avalanche method, which gets extra money first?",
                "The store card at 29.99%",
                ["The credit card at 19.99%", "The line of credit at 9%", "All of them equally"],
                "Avalanche targets the highest rate first.",
            ),
            choice(
                "q3",
                "Same debts, but now using the snowball method. Which gets extra money first?",
                "The credit card with the $300 balance",
                ["The store card at 29.99%", "The line of credit", "All of them equally"],
                "Snowball targets the smallest balance first.",
            ),
            number(
                "q4",
                "A payday loan charges $15 per $100 borrowed for two weeks. What’s the fee on "
                "$400?",
                "60",
                "$400 ÷ $100 = 4, and 4 × $15 = $60 for just two weeks.",
            ),
            choice(
                "q5",
                "In 2026 a Canadian lender offers you a personal loan at 42% APR. What’s true?",
                "It’s above the 35% criminal rate, which is illegal for most loans",
                [
                    "It’s normal for personal loans",
                    "It’s legal as long as you sign",
                    "Only rates above 60% are illegal",
                ],
                "The criminal interest rate dropped to 35% APR on January 1, 2025.",
            ),
        ),
        Task(
            "Ask Penny AI to compare paying down your card vs saving",
            "ai",
            "Should I pay down my credit card or put more into savings?",
        ),
    ),
)

CREDIT_US = (
    LessonContent(
        "us-credit-easy",
        "credit",
        "easy",
        "US",
        "Credit basics (US)",
        "Scores, bureaus, and avoiding interest.",
        (
            "FICO scores run from 300 to 850. The three nationwide credit bureaus are Equifax, "
            "Experian, and TransUnion.",
            "You can get free weekly credit reports from all three at AnnualCreditReport.com.",
            "Credit utilization = balance ÷ limit. Many guides suggest staying under 30%.",
            "Paying on time matters most. Pay the full statement balance by the due date and you "
            "pay no interest on purchases. Card statements must arrive at least 21 days before "
            "the payment is due.",
        ),
        (
            choice(
                "q1",
                "What range do FICO scores use?",
                "300 to 850",
                ["300 to 900", "0 to 100", "1 to 10"],
                "FICO uses 300 to 850. Canadian scores run to 900.",
            ),
            number(
                "q2",
                "You have a $250 balance on a $1,000 limit. What’s your utilization?",
                "25",
                "$250 ÷ $1,000 = 25%.",
                unit="%",
            ),
            multi(
                "q3",
                "Which are the three nationwide credit bureaus? Select all that apply.",
                ["Equifax", "Experian", "TransUnion"],
                ["FICO", "The IRS"],
                "FICO makes a scoring model, not reports. The IRS has nothing to do with credit.",
            ),
            choice(
                "q4",
                "How do you avoid interest on card purchases entirely?",
                "Pay the full statement balance by the due date",
                ["Pay the minimum on time", "Pay half the balance", "Pay just after the due date"],
                "Only a full payment by the due date avoids interest on purchases.",
            ),
        ),
        Task(
            "Ask Penny AI what your card utilization means",
            "ai",
            "What does my credit card utilization mean for my credit?",
        ),
    ),
    LessonContent(
        "us-credit-medium",
        "credit",
        "medium",
        "US",
        "The true cost of credit (US)",
        "Interest, the CARD Act, and disputes.",
        (
            "Monthly interest ≈ balance × APR ÷ 12. Cash advances usually charge interest from "
            "day one and add a fee.",
            "Under the CARD Act, applicants under 21 need proof of independent income or a "
            "co-signer to get a card.",
            "Under the Fair Credit Reporting Act, you can dispute errors, and bureaus generally "
            "must investigate within 30 days.",
            "Applying for credit causes a hard inquiry that can dip your score slightly. "
            "Checking your own report doesn’t.",
        ),
        (
            number(
                "q1",
                "A $1,500 balance at 24% APR. About how much interest builds in one month?",
                "30",
                "$1,500 × 24% ÷ 12 = $30.",
            ),
            choice(
                "q2",
                "A 19-year-old with no income applies for a card alone. What does the CARD Act "
                "require?",
                "Proof of independent income or a co-signer",
                [
                    "Nothing; anyone 18 or older qualifies",
                    "A parent must open the card in their own name",
                    "A credit score of at least 700",
                ],
                "Under-21 applicants need independent income or a co-signer.",
            ),
            choice(
                "q3",
                "You dispute an error with a credit bureau. How long does it generally have to "
                "investigate?",
                "About 30 days",
                ["7 days", "1 year", "There’s no time limit"],
                "The FCRA generally gives bureaus 30 days.",
            ),
            multi(
                "q4",
                "Which can lower your credit score? Select all that apply.",
                ["Missing a payment", "Maxing out your card"],
                ["Checking your own credit report", "Paying in full every month"],
                "Late payments and high utilization hurt. Checking your own report doesn’t.",
            ),
            choice(
                "q5",
                "What’s usually true of a credit card cash advance?",
                "Interest starts right away, usually with a fee",
                [
                    "It gets the same grace period as purchases",
                    "It doesn’t count toward your balance",
                    "It’s free if you repay within a month",
                ],
                "Cash advances skip the grace period and cost more.",
            ),
        ),
        Task(
            "Ask Penny AI how interest would grow on your card",
            "ai",
            "How much interest would my card balance cost if I only paid the minimum?",
        ),
    ),
    LessonContent(
        "us-credit-hard",
        "credit",
        "hard",
        "US",
        "Credit strategist (US)",
        "Overall utilization, payoff methods, and payday APRs.",
        (
            "Utilization counts per card and overall. Overall = total balances ÷ total limits.",
            "Avalanche: extra money to the highest-rate debt first, which saves the most "
            "interest. Snowball: smallest balance first, for quick wins.",
            "Payday loans often charge a flat fee per $100 for two weeks. Simple APR ≈ fee per "
            "$100 (as a %) × 26 two-week periods, which is often near 400%.",
            "Most negative information stays on a US credit report for about 7 years; some "
            "bankruptcies stay for up to 10.",
        ),
        (
            number(
                "q1",
                "Card A: $600 of a $2,000 limit. Card B: $150 of a $3,000 limit. What’s your "
                "overall utilization?",
                "15",
                "$750 ÷ $5,000 = 15%.",
                unit="%",
            ),
            choice(
                "q2",
                "Debts: store card $1,500 at 29.99%, credit card $300 at 21%, car loan $6,000 at "
                "7%. With the avalanche method, which gets extra money first?",
                "The store card at 29.99%",
                ["The credit card with $300", "The car loan", "All of them equally"],
                "Avalanche targets the highest rate.",
            ),
            choice(
                "q3",
                "Same debts, using the snowball method. Which gets extra money first?",
                "The credit card with the $300 balance",
                ["The store card at 29.99%", "The car loan", "All of them equally"],
                "Snowball targets the smallest balance.",
            ),
            number(
                "q4",
                "A payday loan charges $15 per $100 for two weeks. Using × 26, what’s the simple "
                "APR?",
                "390",
                "$15 per $100 is 15% per two weeks, and 15% × 26 = 390%.",
                unit="%",
            ),
            choice(
                "q5",
                "About how long does a late payment usually stay on a US credit report?",
                "About 7 years",
                ["6 months", "2 years", "Forever"],
                "Most negative items drop off after about 7 years.",
            ),
        ),
        Task(
            "Ask Penny AI to compare paying down your card vs saving",
            "ai",
            "Should I pay down my credit card or put more into savings?",
        ),
    ),
)

# ------------------------------------------------------------------ rules & rights

RULES_CA = (
    LessonContent(
        "ca-rules-easy",
        "rules",
        "easy",
        "CA",
        "Your money is protected (Canada)",
        "Deposit insurance, banking rights, and scams.",
        (
            "CDIC insures eligible deposits at member institutions up to $100,000 per insured "
            "category, such as deposits in your own name, TFSAs, and joint accounts, if the "
            "institution fails. Stocks and crypto aren’t covered.",
            "The Financial Consumer Agency of Canada (FCAC) oversees how federally regulated "
            "banks treat customers. Credit unions are usually regulated and insured by their "
            "province.",
            "You can open a bank account without a job or a minimum deposit, as long as you "
            "have acceptable ID. Banks also offer low-cost and no-cost accounts.",
            "Never share your PIN or one-time passcodes. The CRA and banks won’t ask you to pay "
            "with gift cards or crypto.",
        ),
        (
            number(
                "q1",
                "You have $130,000 in one savings account in your own name at a CDIC member bank. "
                "How much is not insured?",
                "30000",
                "Coverage is $100,000 per category, so $30,000 is above the limit.",
            ),
            choice(
                "q2",
                "Can a bank refuse to open a basic account just because you don’t have a job?",
                "No. A job isn’t required, as long as you have acceptable ID",
                [
                    "Yes, a job is always required",
                    "Only if you’re under 18",
                    "Only for savings accounts",
                ],
                "Basic banking rules don’t require employment or a minimum deposit.",
            ),
            choice(
                "q3",
                "A caller says they’re from the CRA and you must pay a tax debt in gift cards "
                "today. What is it?",
                "A scam. Hang up and contact the CRA through its official channels",
                [
                    "Real, so pay quickly to avoid penalties",
                    "Real, but ask for a receipt",
                    "Real if they know your name",
                ],
                "The CRA never demands gift cards or crypto.",
            ),
            multi(
                "q4",
                "Which can be CDIC-insured at a member bank? Select all that apply.",
                ["Deposits in your own name", "TFSA deposits", "Joint deposits"],
                ["Stocks in an investing account", "Crypto"],
                "Eligible deposits are covered by category. Investments and crypto aren’t "
                "deposits.",
            ),
        ),
        Task("See how Penny protects your data in Settings", "settings"),
    ),
    LessonContent(
        "ca-rules-medium",
        "rules",
        "medium",
        "CA",
        "Borrowing rules (Canada)",
        "Interest limits, payday loans, and disclosure.",
        (
            "Since January 1, 2025, charging more than 35% APR on most loans is a crime in Canada.",
            "Since 2025, a federal rule caps the total cost of a payday loan at $14 per $100 "
            "borrowed, and provinces set their own rules too. Even capped, payday loans are "
            "extremely expensive.",
            "Before you sign, lenders must disclose the APR and the total cost of borrowing.",
            "On credit cards from federally regulated lenders, new purchases get at least 21 "
            "days interest-free if you paid the previous balance in full.",
        ),
        (
            number(
                "q1",
                "With a cap of $14 per $100 borrowed, what’s the most a $500 payday loan can cost?",
                "70",
                "$500 ÷ $100 = 5, and 5 × $14 = $70.",
            ),
            number(
                "q2",
                "That’s 14% for two weeks. As a simple yearly rate (× 26 two-week periods), what "
                "APR is that?",
                "364",
                "14% × 26 = 364% a year, far above the 35% limit for regular loans.",
                unit="%",
            ),
            choice(
                "q3",
                "In 2026 a lender offers you an instalment loan at 42% APR. What’s true?",
                "It’s above the 35% criminal rate, which is illegal for most loans",
                [
                    "It’s normal for instalment loans",
                    "It’s legal if you agree in writing",
                    "Only rates over 60% are illegal",
                ],
                "The limit dropped from about 48% to 35% APR in 2025.",
            ),
            choice(
                "q4",
                "Before you sign a loan, what must a lender show you?",
                "The APR and the total cost of borrowing",
                ["Your credit score", "The lender’s profit", "Nothing; it’s optional"],
                "Cost-of-borrowing disclosure lets you compare offers.",
            ),
            choice(
                "q5",
                "You paid last month’s card statement in full and buy something today. What’s the "
                "minimum interest-free period for that purchase?",
                "21 days",
                ["7 days", "None", "60 days"],
                "Federally regulated cards give at least 21 days on new purchases.",
            ),
        ),
        Task(
            "Ask Penny AI what a loan would really cost",
            "ai",
            "How do I work out what a loan would really cost?",
        ),
    ),
    LessonContent(
        "ca-rules-hard",
        "rules",
        "hard",
        "CA",
        "Know your rights (Canada)",
        "Coverage limits, TFSA penalties, complaints, and fraud.",
        (
            "CDIC coverage is per category, per member institution. Money at two different "
            "member banks is insured separately.",
            "Going over your TFSA contribution room costs 1% of the excess for each month it "
            "stays in the account.",
            "With a complaint, start with the bank’s customer service, then use its formal "
            "complaint process. If it’s still unresolved, take it to the independent external "
            "complaints body. The FCAC oversees how banks handle complaints.",
            "Report lost cards and unauthorized transactions right away. You’re generally not "
            "responsible for fraud you didn’t cause, but sharing your PIN can make you liable.",
        ),
        (
            number(
                "q1",
                "You have $90,000 at Bank A and $90,000 at Bank B, both CDIC members, all in your "
                "own name. How much is insured in total?",
                "180000",
                "Each member bank covers up to $100,000 per category, so all $180,000 is covered.",
            ),
            number(
                "q2",
                "You over-contribute $2,000 to your TFSA and leave it there for 3 months. What’s "
                "the penalty?",
                "60",
                "1% × $2,000 = $20 a month, and 3 months = $60.",
            ),
            order(
                "q3",
                "Your complaint about a bank fee isn’t getting anywhere. Put the steps in order.",
                [
                    "Raise it with customer service",
                    "Use the bank’s formal complaint process",
                    "Take it to the external complaints body",
                ],
                "Banks get a chance to fix it first. The external body comes after.",
            ),
            choice(
                "q4",
                "A friend used your debit card after you told them your PIN. What’s most likely?",
                "You may be responsible, because the PIN wasn’t kept private",
                [
                    "The bank always refunds it",
                    "The friend’s bank pays",
                    "It isn’t possible to dispute",
                ],
                "Protection depends on keeping your PIN private.",
            ),
            number(
                "q5",
                "You have $160,000 in deposits in your own name at one CDIC member bank. How much "
                "is not insured?",
                "60000",
                "$160,000 − $100,000 = $60,000 over the limit in that category.",
            ),
        ),
        Task("See how Penny protects your data in Settings", "settings"),
    ),
)

RULES_US = (
    LessonContent(
        "us-rules-easy",
        "rules",
        "easy",
        "US",
        "Your money is protected (US)",
        "FDIC, NCUA, and spotting scams.",
        (
            "The FDIC insures deposits at member banks up to $250,000 per depositor, per bank, "
            "per ownership category, if the bank fails. Stocks and crypto aren’t covered.",
            "The NCUA insures credit union deposits on the same $250,000 basis.",
            "The Consumer Financial Protection Bureau (CFPB) enforces federal consumer financial "
            "laws and takes complaints about banks, cards, and loans.",
            "The IRS usually contacts you by mail first and never demands payment by gift card "
            "or crypto.",
        ),
        (
            number(
                "q1",
                "You have $300,000 in one account in your own name at an FDIC bank. How much is "
                "not insured?",
                "50000",
                "Coverage is $250,000 per ownership category, so $50,000 is above it.",
            ),
            choice(
                "q2",
                "Who insures deposits at a federal credit union?",
                "The NCUA",
                ["The FDIC", "The IRS", "Nobody"],
                "The NCUA does for credit unions what the FDIC does for banks.",
            ),
            choice(
                "q3",
                "A caller says they’re the IRS and you must pay in gift cards within an hour. "
                "What is it?",
                "A scam. Hang up and contact the IRS directly",
                ["Real, so pay quickly", "Real if they know your SSN", "Real, but get a receipt"],
                "The IRS never demands gift cards, and usually writes first.",
            ),
            multi(
                "q4",
                "Which can be FDIC-insured at a member bank? Select all that apply.",
                ["Checking accounts", "Savings accounts", "Certificates of deposit (CDs)"],
                ["Stocks", "Crypto"],
                "Deposits are covered; investments aren’t.",
            ),
        ),
        Task("See how Penny protects your data in Settings", "settings"),
    ),
    LessonContent(
        "us-rules-medium",
        "rules",
        "medium",
        "US",
        "Borrowing rules (US)",
        "Truth in Lending, the CARD Act, and payday loans.",
        (
            "The Truth in Lending Act requires lenders to show the APR and the finance charge "
            "before you sign.",
            "The CARD Act bans over-limit fees unless you opt in, and requires statements at "
            "least 21 days before the due date.",
            "Payday loans are regulated by states. Some ban them; others cap fees.",
            "Under the Fair Credit Reporting Act, you can dispute errors, and bureaus generally "
            "must investigate within 30 days.",
        ),
        (
            choice(
                "q1",
                "Your card charges an over-limit fee, but you never opted in. Is that allowed?",
                "No. Over-limit fees need your opt-in",
                [
                    "Yes, always",
                    "Yes, if it’s under $25",
                    "Only for store cards",
                ],
                "The CARD Act requires opt-in for over-limit fees.",
            ),
            choice(
                "q2",
                "Before you sign a loan, what must the lender show under the Truth in Lending Act?",
                "The APR and the finance charge",
                ["Your credit score", "Their profit margin", "Nothing; it’s optional"],
                "Standard disclosures let you compare offers.",
            ),
            number(
                "q3",
                "A payday lender charges $15 per $100 for two weeks. What’s the fee on $300?",
                "45",
                "3 × $15 = $45.",
            ),
            choice(
                "q4",
                "Are payday loans legal everywhere in the US?",
                "No. It depends on the state, and some ban them",
                [
                    "Yes, under federal law",
                    "Only online",
                    "Only for people over 25",
                ],
                "States set payday loan rules.",
            ),
            choice(
                "q5",
                "How many days before the due date must a card statement arrive?",
                "At least 21",
                ["At least 7", "At least 60", "There’s no rule"],
                "The CARD Act requires at least 21 days.",
            ),
        ),
        Task(
            "Ask Penny AI what a loan would really cost",
            "ai",
            "How do I work out what a loan would really cost?",
        ),
    ),
    LessonContent(
        "us-rules-hard",
        "rules",
        "hard",
        "US",
        "Know your rights (US)",
        "Coverage limits, fraud liability, and debt collectors.",
        (
            "FDIC coverage is per depositor, per bank, per ownership category. Money at two "
            "different banks is insured separately.",
            "Debit cards (Electronic Fund Transfer Act): report a lost card within 2 business "
            "days and your loss is capped at $50. After that but within 60 days of your "
            "statement, up to $500. Later than that, it can be unlimited. Credit card liability "
            "for unauthorized charges is capped at $50.",
            "Debt collectors can’t harass you. If you dispute a debt in writing within 30 days, "
            "they must verify it before collecting.",
            "Putting more into an IRA than allowed costs a 6% tax on the excess for each year it "
            "stays.",
        ),
        (
            number(
                "q1",
                "$200,000 at Bank A and $200,000 at Bank B, both FDIC-insured, all in your own "
                "name. How much is insured in total?",
                "400000",
                "Each bank covers up to $250,000 per category, so all $400,000 is covered.",
            ),
            number(
                "q2",
                "You report your lost debit card on day 5 (after 2 business days, but within 60 "
                "days). $800 was stolen. What’s the most you can lose?",
                "500",
                "Reporting after 2 business days but within 60 days caps the loss at $500.",
            ),
            number(
                "q3",
                "You put $1,000 more than allowed into your IRA and leave it for one year. What’s "
                "the tax?",
                "60",
                "6% × $1,000 = $60.",
            ),
            choice(
                "q4",
                "A collector calls about a debt you don’t recognize. What’s your best first move?",
                "Dispute it in writing within 30 days so they must verify it",
                ["Pay it to make them stop", "Ignore every letter", "Give them your bank login"],
                "Written disputes trigger verification.",
            ),
            order(
                "q5",
                "Rank these by how much you could lose if your debit card is stolen, smallest to "
                "largest.",
                [
                    "Reported within 2 business days",
                    "Reported within 60 days of your statement",
                    "Reported after 60 days",
                ],
                "$50, then $500, then potentially unlimited.",
            ),
        ),
        Task("See how Penny protects your data in Settings", "settings"),
    ),
)

# ------------------------------------------------------------------ investing

INVESTING_SHARED = (
    LessonContent(
        "investing-easy",
        "investing",
        "easy",
        None,
        "Investing 101",
        "Risk, return, diversification, and fees.",
        (
            "Investing means buying something, like shares or bonds, that can grow but can also "
            "lose value. Higher possible returns come with higher risk.",
            "Diversification means spreading money across many investments, so one bad result "
            "doesn’t sink everything. Index funds and ETFs hold many companies at once.",
            "Time horizon matters. Money you need within a few years, like next term’s tuition, "
            "usually belongs somewhere safe rather than in stocks.",
            "Fees come out every year whether you gain or not. A 2% fee on $10,000 is $200 a year.",
        ),
        (
            choice(
                "q1",
                "What does diversification mean?",
                "Spreading money across many investments",
                [
                    "Putting everything in the best company",
                    "Switching investments often",
                    "Only holding cash",
                ],
                "Many holdings means no single failure sinks you.",
            ),
            choice(
                "q2",
                "You need $3,000 for tuition in 8 months. Where does it usually belong?",
                "Somewhere safe, like a savings account",
                ["Individual stocks", "Crypto", "A 10-year investment plan"],
                "Short time horizons can’t ride out a market drop.",
            ),
            number(
                "q3",
                "You have $10,000 invested with a 1.5% yearly fee. How much is the fee this year?",
                "150",
                "$10,000 × 1.5% = $150.",
            ),
            multi(
                "q4",
                "Which can lose value? Select all that apply.",
                ["Shares of a company", "A stock index ETF"],
                ["An insured savings deposit within the limit"],
                "Market investments can fall. Insured deposits within limits don’t lose value.",
            ),
        ),
        Task("Try the growth explorer in Invest", "invest"),
    ),
    LessonContent(
        "investing-hard",
        "investing",
        "hard",
        None,
        "Growth, fees, and time",
        "Compounding, fee drag, and steady investing.",
        (
            "Compounding works for returns and against fees. A fee is subtracted from your "
            "return every year, so a 2% fee on a 6% return leaves about 4%.",
            "Rule of 72: years to double ≈ 72 ÷ the yearly rate in percent. Fees change that "
            "number a lot.",
            "Dollar-cost averaging means investing the same amount on a schedule. When prices "
            "are low, the same money buys more units.",
            "Nobody reliably times the market. Time in the market usually matters more than "
            "timing it.",
        ),
        (
            number(
                "q1",
                "$10,000 grows 6% a year, compounding yearly. What’s it worth after 2 years?",
                "11236",
                "$10,000 × 1.06 = $10,600, then × 1.06 = $11,236.",
            ),
            number(
                "q2",
                "A fund returns 6% a year but charges 2%. Using the Rule of 72 on the net return, "
                "about how many years does money take to double?",
                "18",
                "6% − 2% = 4% net, and 72 ÷ 4 = 18 years, versus 12 without the fee.",
                unit="years",
            ),
            number(
                "q3",
                "You invest $100 a month. The price per unit is $20 in January and $25 in "
                "February. How many units do you own after both months?",
                "9",
                "$100 ÷ $20 = 5 units, plus $100 ÷ $25 = 4 units, for 9.",
                unit="",
            ),
            number(
                "q4",
                "$10,000 for one year: Fund A returns 5% after fees; Fund B returns 3% after "
                "fees. How many more dollars does Fund A earn?",
                "200",
                "$500 − $300 = $200 in a single year, and the gap compounds over time.",
            ),
            choice(
                "q5",
                "Prices just dropped 10% and you invest monthly. What happens with dollar-cost "
                "averaging?",
                "Your next contribution buys more units",
                [
                    "You should stop until prices recover",
                    "Your contribution buys fewer units",
                    "Nothing changes",
                ],
                "Same dollars, lower price, more units.",
            ),
        ),
        Task("Compare fees in the growth explorer in Invest", "invest"),
    ),
)

INVESTING_CA = LessonContent(
    "ca-investing-medium",
    "investing",
    "medium",
    "CA",
    "TFSA, RRSP, and FHSA",
    "Canada’s registered accounts and their 2026 limits.",
    (
        "TFSA: growth and withdrawals are tax-free. The 2026 limit is $7,000, and unused room "
        "carries forward. Money you withdraw is added back to your room on January 1 of the next "
        "year.",
        "RRSP: contributions are deductible now and taxed when withdrawn. Room is 18% of the "
        "previous year’s earned income, up to $33,810 for 2026.",
        "FHSA: for a first home. Contributions are deductible and qualifying withdrawals are "
        "tax-free. The limit is $8,000 a year and $40,000 for life.",
        "These are account types, not investments. Each can hold savings deposits, GICs, or funds.",
    ),
    (
        number(
            "q1",
            "You earned $20,000 last year. How much new RRSP room does that create?",
            "3600",
            "18% × $20,000 = $3,600.",
        ),
        choice(
            "q2",
            "You withdraw $3,000 from your TFSA in March. When does that room come back?",
            "On January 1 of next year",
            ["Immediately", "In 12 months, in March", "Never"],
            "TFSA withdrawals are added back the following calendar year.",
        ),
        number(
            "q3",
            "Contributing the full $8,000 every year, how many years does it take to reach the "
            "FHSA lifetime limit?",
            "5",
            "$40,000 ÷ $8,000 = 5 years.",
            unit="years",
        ),
        multi(
            "q4",
            "Which accounts give you a tax deduction when you contribute? Select all that apply.",
            ["RRSP", "FHSA"],
            ["TFSA"],
            "RRSP and FHSA contributions are deductible. TFSA contributions aren’t, but "
            "withdrawals are tax-free.",
        ),
        choice(
            "q5",
            "True or false: a TFSA is itself an investment that grows at a set rate.",
            "False. It’s an account that can hold different investments",
            ["True", "True, but only for people under 30", "True if you open it at a bank"],
            "Growth depends on what you hold inside it.",
        ),
    ),
    Task("Read about registered accounts in Invest", "invest"),
)

INVESTING_US = LessonContent(
    "us-investing-medium",
    "investing",
    "medium",
    "US",
    "401(k), IRA, and Roth",
    "US retirement accounts and their 2026 limits.",
    (
        "401(k): a workplace plan. In 2026 you can contribute up to $24,500. Many employers "
        "match part of what you put in, which is free money.",
        "IRA: an individual account with a 2026 limit of $7,500. A traditional IRA may be "
        "deductible now and is taxed later.",
        "Roth (IRA or 401(k)): no deduction now, but qualified withdrawals are tax-free. You can "
        "take out your own Roth IRA contributions (not earnings) at any time.",
        "A 529 plan is for education costs. These are account types, not investments: what grows "
        "is whatever you hold inside.",
    ),
    (
        number(
            "q1",
            "Your salary is $40,000. Your employer matches 50% of what you contribute, up to 6% "
            "of salary. You contribute 6%. How much is the match?",
            "1200",
            "6% × $40,000 = $2,400 from you, and 50% of that is a $1,200 match.",
        ),
        number(
            "q2",
            "You’ve already put $5,000 into your IRA for 2026. How much more can you add?",
            "2500",
            "$7,500 − $5,000 = $2,500.",
        ),
        choice(
            "q3",
            "Which kind of account gives tax-free qualified withdrawals in retirement?",
            "Roth",
            ["Traditional IRA", "Taxable brokerage account", "Every account does"],
            "Roth accounts trade no deduction now for tax-free withdrawals later.",
        ),
        choice(
            "q4",
            "You contribute 2% of salary, but your employer matches up to 6%. What’s happening?",
            "You’re leaving part of the free match on the table",
            ["Nothing; the match is the same", "You’re paying a penalty", "You’ll lose the 2%"],
            "Contributing up to the full match collects all of it.",
        ),
        choice(
            "q5",
            "What is a 529 plan for?",
            "Education costs",
            ["Retirement only", "Buying a car", "Paying credit card debt"],
            "529 plans are education savings accounts.",
        ),
    ),
    Task("Try the growth explorer in Invest", "invest"),
)

# ------------------------------------------------------------------ catalog

ALL_LESSONS: tuple[LessonContent, ...] = (
    *BUDGETING,
    *SAVING,
    *TAX_CA,
    *TAX_US,
    *CREDIT_CA,
    *CREDIT_US,
    *RULES_CA,
    *RULES_US,
    INVESTING_SHARED[0],
    INVESTING_CA,
    INVESTING_US,
    INVESTING_SHARED[1],
)
LESSONS_BY_ID = {lesson.id: lesson for lesson in ALL_LESSONS}


def lessons_for(country: Country) -> list[LessonContent]:
    """Every lesson for one country, in topic then tier order."""
    tier_rank = {tier: index for index, tier in enumerate(TIERS)}
    topic_rank = {topic: index for index, (topic, _, _) in enumerate(TOPICS)}
    return sorted(
        (item for item in ALL_LESSONS if item.country in (None, country)),
        key=lambda item: (topic_rank[item.topic], tier_rank[item.tier]),
    )
