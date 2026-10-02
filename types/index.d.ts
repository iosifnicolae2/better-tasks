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
}

export type TurnFacts = { asked: boolean; namedTime: boolean }

declare module 'claude-code' {
  interface PluginState {
    supermanager: {
      tasks: Task[]
      team: Teammate[]
      tokens: Record<string, number>
      notice: string
      turn: TurnFacts
      /** The footer label: sprint progress. */
      footer: string
      /** The Tasks pane's selected task id. */
      selected: string
      /** The Tasks pane's board layout. */
      view: 'table' | 'kanban'
      /** The Tasks pane's page. */
      page: 'board' | 'config'
    }
  }
}
