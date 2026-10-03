export type TaskStatus = 'todo' | 'doing' | 'done' | 'cancelled'

export type When = 'now' | 'this-sprint' | 'next-sprint' | 'backlog'

export type Task = {
  id: string
  title: string
  /** The sprint's start date (YYYY-MM-DD), or "backlog". */
  sprint: string
  urgent: boolean
  status: TaskStatus
  owner: string
  rolled: number
  /** Place within its section, smallest first; ties go by id. */
  order: number
  created: string
  /** Absolute path of the task file. */
  file: string
  /** Everything after the frontmatter. */
  body: string
}

export type Teammate = {
  id: string
  name: string
  status: string
  /** Context fill, 0 to 100; undefined until its first step. */
  percent?: number
  /** What it does right now ("editing auth.ts"); absent between turns. */
  activity?: string
  /** When that activity began, in ms. */
  activeAt?: number
}

export type Activity = { text: string; at: number }

export type TurnFacts = { asked: boolean; namedTime: boolean }

declare module 'claude-code' {
  interface PluginState {
    'better-tasks': {
      tasks: Task[]
      team: Teammate[]
      tokens: Record<string, number>
      /** The current activity per agent id; cleared when its turn ends. */
      activity: Record<string, Activity>
      notice: string
      turn: TurnFacts
      /** The footer label: sprint progress. */
      footer: string
      /** The Tasks pane's selected task id. */
      selected: string
      /** The task id whose actions hold the keys after Enter; '' for none. */
      acting: string
      /** The task id the pane has picked up for moving; '' for none. */
      moving: string
      /** The agent id the pane's "View session" peek shows; '' for none. */
      viewing: string
      /** The Tasks pane's page. */
      page: 'board' | 'config' | 'session'
    }
  }
}
