import { TeamDto } from '@api/generated'
import { TeamDao } from '@prisma/client'
import { ApiError, ApiErrorCodes } from 'src/middleware/errorhandler/APIError'
import { dbClient } from 'src/server'
import { getUsersByAndrewIds } from './userService'

/**
 * Get a team from the database by teamId
 * @param {string} teamId the id of the team
 * @returns {TeamDao} the corresponding team
 * @throws {ApiError} if the team is not found
 */
export const getTeamById = async (teamId: string): Promise<TeamDao> => {
  const retrievedTeam: TeamDao | null = (await dbClient.teamDao.findUnique({
    where: {
      githubUsername: teamId,
    },
    include: {
      members: true,
    },
  })) as any as TeamDao | null

  if (!retrievedTeam) {
    throw new ApiError(ApiErrorCodes.NOT_FOUND, 'Team not found')
  }

  return retrievedTeam
}

/**
 * Update a team in the database by teamId
 * @param {string} githubUsername the id of the team
 * @param {TeamDto} team the updated team
 * @returns {TeamDao} the updated team
 * @throws {ApiError} if the team is not found
 */
export const updateTeamByGithubUsername = async (
  githubUsername: string,
  team: TeamDto,
): Promise<TeamDao> => {
  if (team.githubUsername !== githubUsername) {
    throw new ApiError(
      ApiErrorCodes.BAD_REQUEST,
      'Cannot change the github username of a team',
    )
  }

  // First, get the current team members
  const currentTeam = await dbClient.teamDao.findUnique({
    where: { githubUsername },
    include: { members: true },
  })

  if (!currentTeam) {
    throw new ApiError(ApiErrorCodes.NOT_FOUND, 'Team not found')
  }

  // Disconnect users not in the new list
  const disconnectMembers = currentTeam.members
    .filter(member => !team.members.includes(member.andrewId))
    .map(member => ({ andrewId: member.andrewId }))

  if (disconnectMembers.length > 0) {
    await dbClient.teamDao.update({
      where: { githubUsername },
      data: { members: { disconnect: disconnectMembers } },
    })
  }

  // Then, connect or create the users in the new list
  const updatedTeam = await dbClient.teamDao.update({
    where: { githubUsername },
    data: {
      members: {
        connectOrCreate: team.members.map(member => ({
          where: { andrewId: member },
          create: { andrewId: member },
        })),
      },
    },
    include: { members: true },
  })

  return updatedTeam
}

/**
 * Create a team in the database
 * @param {TeamDto} team the team to create
 * @returns {TeamDao} the created team
 * @throws {ApiError} if the team already exists
 */
export const createTeam = async (team: TeamDto): Promise<TeamDao> => {
  const retrievedTeam: TeamDao | null = (await dbClient.teamDao.findUnique({
    where: {
      githubUsername: team.githubUsername,
    },
  })) as any as TeamDao | null

  if (retrievedTeam) {
    throw new ApiError(
      ApiErrorCodes.BUSINESS_LOGIC_ERROR,
      'Team already exists',
    )
  }

  const users = await getUsersByAndrewIds(team.members)
  const membersToAdd = users.filter(user => !user.teamDaoGithubUsername)

  const createdTeam: TeamDao = (await dbClient.teamDao.create({
    data: {
      githubUsername: team.githubUsername,
      members: {
        connectOrCreate: membersToAdd.map(member => ({
          where: { andrewId: member.andrewId },
          create: { andrewId: member.andrewId },
        })),
      },
    },
    include: {
      members: true,
    },
  })) as any as TeamDao

  return createdTeam
}

/**
 * Delete a team from the database by teamId
 * @param {string} githubUsername the id of the team
 */
export const deleteTeam = async (githubUsername: string): Promise<void> => {
  await dbClient.teamDao.delete({
    where: {
      githubUsername,
    },
  })
}
