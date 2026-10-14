/// <reference types="cypress" />

/**
 * Endless mode — end-to-end.
 *
 * These run against the real app plus a local Supabase stack. The page signs in
 * anonymously on its own, then pulls batches of questions from every published
 * public quiz and grades each answer server-side.
 *
 * Prerequisites:
 *   npm run supabase:start   # backend up + migrations applied + seed
 *   npm run dev              # app on http://localhost:5173
 *
 * Then: npm run e2e   (Cypress runs in Edge)
 */

const S = {
  prompt: '[data-cy=endless-prompt]',
  topic: '[data-cy=endless-topic]',
  options: '[data-cy=endless-options] button',
  feedback: '[data-cy=endless-feedback]',
  stop: '[data-cy=endless-stop]',
  summary: '[data-cy=endless-summary]',
  areas: '[data-cy=endless-areas]',
  areasEmpty: '[data-cy=endless-areas-empty]',
  areaChip: '[data-cy=endless-area-chip]',
  streak: '[data-cy=endless-streak]',
  accuracy: '[data-cy=endless-accuracy]',
} as const

/** Waits for the first question — the app fetches a batch behind a skeleton. */
function waitForFirstQuestion() {
  cy.get(S.prompt, { timeout: 25_000 }).should('be.visible')
  cy.get(S.options).should('have.length.at.least', 2)
}

/**
 * Answers the first option, then moves on as soon as the next question is
 * ready: click "Tiếp" if the feedback is still up, otherwise let the
 * auto-advance finish. Resilient to either timing.
 */
function answerFirstOption() {
  cy.get(S.options).first().click()
  cy.get(S.feedback).should('be.visible')

  cy.get('body').then(($body) => {
    const $continue = $body.find(`${S.feedback} button`)
    if ($continue.length > 0) {
      cy.wrap($continue).first().click()
    }
  })

  cy.get(S.feedback).should('not.exist')
}

describe('Endless mode', () => {
  beforeEach(() => {
    cy.visit('/endless')
    waitForFirstQuestion()
  })

  it('opens straight into a question, with no start screen', () => {
    cy.get(S.prompt).invoke('text').should('not.be.empty')
    cy.get(S.stop).should('be.visible')

    // Nothing was asked of the player before play began.
    cy.get('input').should('not.exist')
    cy.contains('Bắt đầu làm bài').should('not.exist')

    // No answers yet, so the areas footer still shows its empty hint.
    cy.get(S.areas).should('be.visible')
    cy.get(S.areasEmpty).should('be.visible')
  })

  it('grades an answer, reveals the key and advances', () => {
    cy.get(S.prompt)
      .invoke('text')
      .then((firstPrompt) => {
        cy.get(S.options).first().click()

        cy.get(S.feedback).should('be.visible')
        cy.get(S.feedback)
          .invoke('text')
          .should('match', /Chính xác!|Chưa đúng/)

        // Exactly one option is marked correct; the rest are dimmed or wrong.
        cy.get(`${S.options}[data-state="correct"]`).should('have.length', 1)
        cy.get(`${S.options}[data-state="dim"]`).should('have.length.at.least', 1)

        // The next question replaces the graded one.
        cy.get(S.prompt).invoke('text').should('not.eq', firstPrompt)
      })
  })

  it('keeps the streak and accuracy readouts in step with the result', () => {
    cy.get(S.options).first().click()
    cy.get(S.feedback).should('be.visible')

    cy.get(S.feedback)
      .invoke('text')
      .then((text) => {
        const wasCorrect = text.includes('Chính xác!')
        cy.get(S.streak).should('have.text', wasCorrect ? '1' : '0')
        cy.get(S.accuracy).should('have.text', wasCorrect ? '100%' : '0%')
      })
  })

  it('stops at any time and shows a session summary', () => {
    cy.get(S.options).first().click()
    cy.get(S.feedback).should('be.visible')
    cy.get(S.stop).click()

    cy.get(S.summary).should('be.visible')
    cy.get(S.summary).should('contain.text', 'Phiên luyện tập')
    cy.get(S.summary).should('contain.text', 'Đã làm')
    cy.get(S.summary).should('contain.text', 'Chính xác')
    cy.get(S.summary).should('contain.text', 'Chuỗi dài nhất')
  })

  it('restarts cleanly from the summary', () => {
    cy.get(S.options).first().click()
    cy.get(S.feedback).should('be.visible')
    cy.get(S.stop).click()

    cy.get(S.summary).contains('button', 'Chơi tiếp').click()

    cy.get(S.summary).should('not.exist')
    waitForFirstQuestion()
    cy.get(S.streak).should('have.text', '0')
    cy.get(S.accuracy).should('have.text', '0%')
  })

  it('starts tracking an area once a tagged question is answered', () => {
    // Questions are drawn from every quiz, and a quiz may have no topic. Answer
    // until one with a topic comes up, then the area footer must list it.
    const answerUntilTagged = (remaining: number) => {
      cy.get(S.topic)
        .invoke('text')
        .then((topicText) => {
          const tagged = !topicText.includes('Tổng hợp')

          cy.get(S.options).first().click()
          cy.get(S.feedback).should('be.visible')

          if (tagged) {
            cy.get(S.areaChip).should('have.length.at.least', 1)
          } else if (remaining > 0) {
            cy.get(S.feedback).contains('button', 'Tiếp').click()
            cy.get(S.prompt).should('be.visible')
            answerUntilTagged(remaining - 1)
          }
        })
    }

    answerUntilTagged(8)
  })

  it(
    'pulls another batch before the buffer runs dry',
    function () {
      this.timeout(60_000)

      // Registered after the first batch already loaded, so this waits for the
      // *prefetch* rather than the initial fetch.
      cy.intercept('POST', '**/rest/v1/rpc/get_endless_batch').as('batch')

      for (let i = 0; i < 8; i += 1) {
        answerFirstOption()
      }

      cy.wait('@batch').its('response.statusCode').should('eq', 200)
    },
  )
})
