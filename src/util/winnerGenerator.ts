import { Context, $, Random } from 'koishi'

export async function getWinnerList(ctx: Context, rollId: number) {
  const memberList = []
  const prizeList = []

  const resMember = await ctx.database.get('roll_member', {roll_id: rollId})
  // 历史数据里可能有重复的参与记录（并发重复写入）：按 user_id 去重，避免同一个人被抽中两次
  resMember.forEach(m => {
    if (!memberList.includes(m.user_id)) memberList.push(m.user_id)
  })
  if (memberList.length === 0) return []

  const resPrizes = await ctx.database.get('roll_prize', {roll_id: rollId})
  for (const p of resPrizes) {
    const resPrize = await ctx.database.get('prize', {id: p.prize_id})
    for (let i = 0; i < resPrize[0].amount; i++) {
      prizeList.push(resPrize[0].id);
    }
  }
  const res = await ctx.database.get('roll', {id: rollId})
  const roll = res[0]
  // Draws with repeatable winners
  if (roll.rollType === '0') {
    return repeatableWinners(memberList, prizeList)
  }
  // Draw with unique winners
  else if (roll.rollType === '1') {
    return uniqueWinners(memberList, prizeList)
  }
}

export function uniqueWinners(memberList: string[], prizeList: string[]) {
  if (memberList.length === 0 || prizeList.length === 0) return []
  // 「不允许重复中奖」：一个中奖人只能拿一个名额，因此最多抽出 min(参与者, 奖品数) 个名额。
  // 人不够时宁可不抽满（剩余奖品不发放），也不能循环复用同一个人。
  const length = Math.min(memberList.length, prizeList.length)
  const shuffledMembers = Random.shuffle(memberList)
  const shuffledPrizes = Random.shuffle(prizeList)
  return shuffledMembers.slice(0, length).map((member, i) => ({ userId: member, prizeId: shuffledPrizes[i] }))
}

export function repeatableWinners(memberList: string[], prizeList: string[]) {
  if (memberList.length === 0 || prizeList.length === 0) return []
  const winners = [];

  for (let i = 0; i < prizeList.length; i++) {
    winners.push({ userId: Random.pick(memberList), prizeId: prizeList[i] });
  }
  return winners
}

