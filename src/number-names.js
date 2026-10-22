const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const BASE = 10;
const TEENS_END = ONES.length;
const HUNDREDS_STEP = BASE * BASE;
const GROUP_STEP = HUNDREDS_STEP * BASE;
const LARGEST_SPELLED = GROUP_STEP * GROUP_STEP - 1;

function belowHundred(value) {
  if (value < TEENS_END) return [ONES[value]];
  const tens = TENS[Math.floor(value / BASE)];
  const rest = value % BASE;
  return rest === 0 ? [tens] : [tens, ONES[rest]];
}

/** Every common English spelling of 0–999: "onehundredfive", "onehundredandfive", "hundredfive". */
function belowThousand(value) {
  if (value < HUNDREDS_STEP) return [belowHundred(value).join('')];
  const hundreds = `${ONES[Math.floor(value / HUNDREDS_STEP)]}hundred`;
  const rest = value % HUNDREDS_STEP;
  const leads = value < 2 * HUNDREDS_STEP ? [hundreds, 'hundred'] : [hundreds];
  if (rest === 0) return leads;
  const tail = belowHundred(rest).join('');
  return leads.flatMap((lead) => [`${lead}${tail}`, `${lead}and${tail}`]);
}

function spell(value) {
  if (value < GROUP_STEP) return belowThousand(value);
  const thousands = belowThousand(Math.floor(value / GROUP_STEP)).map((lead) => `${lead}thousand`);
  const leads = value < 2 * GROUP_STEP ? [...thousands, 'thousand'] : thousands;
  const rest = value % GROUP_STEP;
  if (rest === 0) return leads;
  const tails = belowThousand(rest);
  const joiners = rest < HUNDREDS_STEP ? ['', 'and'] : [''];
  return leads.flatMap((lead) => tails.flatMap((tail) => joiners.map((joiner) => `${lead}${joiner}${tail}`)));
}

/** 0.5 gives "zeropointfive" and "pointfive"; 1.25 gives "onepointtwofive". */
function spellDecimal(magnitude) {
  const [whole, fraction] = String(magnitude).split('.');
  const wholeNumber = Number(whole);
  if (!fraction || wholeNumber > LARGEST_SPELLED) return [];
  const fractionWords = [...fraction].map((digit) => ONES[Number(digit)]).join('');
  const leads = wholeNumber === 0 ? ['zero', ''] : spell(wholeNumber);
  return leads.map((lead) => `${lead}point${fractionWords}`);
}

function spellAny(magnitude) {
  if (Number.isInteger(magnitude)) return magnitude <= LARGEST_SPELLED ? spell(magnitude) : [];
  return spellDecimal(magnitude);
}

const NUMBER_PREFIXES = ['', 'n', 'num', 'number', 'no', 'val', 'value', 'int', 'integer', 'const', 'k'];
const NEGATIVE_PREFIXES = ['minus', 'negative', 'neg', 'm'];

/**
 * The names a constant could have that say only which number it holds, normalised to lowercase
 * with separators removed: 10000 gives "10000", "tenthousand", "num10000", "n10000" and so on.
 */
export function selfNames(value) {
  const magnitude = Math.abs(value);
  const digits = String(magnitude).replace('.', 'point');
  const bodies = [digits, ...spellAny(magnitude)];
  const signs = value < 0 ? NEGATIVE_PREFIXES : [''];
  return new Set(signs.flatMap((sign) => NUMBER_PREFIXES.flatMap((prefix) => bodies.map((body) => `${sign}${prefix}${body}`))));
}

/** "TEN_THOUSAND", "tenThousand" and "Ten-Thousand" all normalise to "tenthousand". */
export function normaliseName(name) {
  return name.replace(/[^a-z0-9.]/gi, '').toLowerCase().replace('.', 'point');
}
