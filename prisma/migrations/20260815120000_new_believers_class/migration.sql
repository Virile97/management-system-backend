-- New Believers Class: students via members.isNewBeliever; teachers via
-- members in the "New Believers Teachers" group; curriculum + enrollments.

ALTER TABLE "members" ADD COLUMN "isNewBeliever" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "members_isNewBeliever_idx" ON "members"("isNewBeliever");

CREATE TYPE "NbcEnrollmentStatus" AS ENUM ('ON_TRACK', 'BEHIND', 'ADVANCED');

CREATE TABLE "nbc_lessons" (
    "id" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nbc_lessons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "nbc_lessons_sortOrder_key" ON "nbc_lessons"("sortOrder");
CREATE INDEX "nbc_lessons_isActive_sortOrder_idx" ON "nbc_lessons"("isActive", "sortOrder");

CREATE TABLE "nbc_enrollments" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "currentLessonId" TEXT NOT NULL,
    "status" "NbcEnrollmentStatus" NOT NULL DEFAULT 'ON_TRACK',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "graduatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nbc_enrollments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "nbc_enrollments_studentId_key" ON "nbc_enrollments"("studentId");
CREATE INDEX "nbc_enrollments_teacherId_idx" ON "nbc_enrollments"("teacherId");
CREATE INDEX "nbc_enrollments_currentLessonId_idx" ON "nbc_enrollments"("currentLessonId");
CREATE INDEX "nbc_enrollments_status_idx" ON "nbc_enrollments"("status");

CREATE TABLE "nbc_lesson_events" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "fromLessonId" TEXT,
    "toLessonId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nbc_lesson_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "nbc_lesson_events_enrollmentId_createdAt_idx" ON "nbc_lesson_events"("enrollmentId", "createdAt");
CREATE INDEX "nbc_lesson_events_toLessonId_idx" ON "nbc_lesson_events"("toLessonId");

ALTER TABLE "nbc_enrollments" ADD CONSTRAINT "nbc_enrollments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nbc_enrollments" ADD CONSTRAINT "nbc_enrollments_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "nbc_enrollments" ADD CONSTRAINT "nbc_enrollments_currentLessonId_fkey" FOREIGN KEY ("currentLessonId") REFERENCES "nbc_lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "nbc_lesson_events" ADD CONSTRAINT "nbc_lesson_events_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "nbc_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nbc_lesson_events" ADD CONSTRAINT "nbc_lesson_events_fromLessonId_fkey" FOREIGN KEY ("fromLessonId") REFERENCES "nbc_lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "nbc_lesson_events" ADD CONSTRAINT "nbc_lesson_events_toLessonId_fkey" FOREIGN KEY ("toLessonId") REFERENCES "nbc_lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
