import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, MessageSquare, ShieldCheck, Star, Trash2 } from 'lucide-react';
import type { Facility, FacilityReview } from '../types';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  deleteFacilityReview,
  fetchPublicFacilityReviews,
  saveFacilityReview,
} from '../lib/firebase';
import { GoogleSignInButton } from './GoogleSignInButton';

interface ApiFacilityRating {
  id: number;
  facilityId: number;
  facilityName: string;
  userUid: string;
  authorName: string;
  rating: number;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

interface NormalizedReview {
  id: string;
  dbId?: number;
  facilityId: number;
  facilityName: string;
  userId: string;
  authorName: string;
  rating: number;
  comment: string;
  timestampMs: number;
  dateLabel: string;
}

export interface FacilityRatingProps {
  facility: Facility;
  /** Optional externally managed reviews (e.g. live Firestore feed from FacilityMap). */
  reviews?: FacilityReview[];
  /** Optional external loading indicator paired with the `reviews` prop. */
  loading?: boolean;
  /** Optional callback triggered after a rating is saved or removed. */
  onRatingSaved?: () => void;
}

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
};

function toTimestampMs(value: any): number {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateLabel(ms: number): string {
  if (!ms) return 'Just now';
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export const FacilityRating: React.FC<FacilityRatingProps> = ({
  facility,
  reviews: externalReviews,
  loading: externalLoading,
  onRatingSaved,
}) => {
  const { firebaseUser, dbUser, signingIn, signInWithGoogle, pushNotification } = useAuth();

  const [apiRatings, setApiRatings] = useState<ApiFacilityRating[]>([]);
  const [standaloneFirestoreReviews, setStandaloneFirestoreReviews] = useState<FacilityReview[]>([]);
  const [internalLoading, setInternalLoading] = useState<boolean>(externalReviews === undefined);

  const [reviewSort, setReviewSort] = useState<'newest' | 'highest' | 'lowest'>('newest');
  const [ratingInput, setRatingInput] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [commentInput, setCommentInput] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadApiRatings = useCallback(async () => {
    try {
      const data = await apiFetch<{ ratings: ApiFacilityRating[] }>(
        `/api/facilities/${facility.id}/ratings`,
        { method: 'GET' },
        false
      );
      setApiRatings(Array.isArray(data?.ratings) ? data.ratings : []);
    } catch {
      // Fall back quietly to live Firestore reviews if API read is unavailable
    }
  }, [facility.id]);

  useEffect(() => {
    let active = true;
    const isStandalone = externalReviews === undefined;
    if (isStandalone) setInternalLoading(true);

    const tasks: Promise<unknown>[] = [loadApiRatings()];
    if (isStandalone) {
      tasks.push(
        fetchPublicFacilityReviews()
          .then((items) => {
            if (active) {
              setStandaloneFirestoreReviews(items.filter((r) => r.facilityId === facility.id));
            }
          })
          .catch(() => {})
      );
    }

    void Promise.allSettled(tasks).finally(() => {
      if (active && isStandalone) setInternalLoading(false);
    });

    return () => {
      active = false;
    };
  }, [facility.id, externalReviews, loadApiRatings]);

  const mergedReviews = useMemo<NormalizedReview[]>(() => {
    const byUserKey = new Map<string, NormalizedReview>();
    const firestoreList = (externalReviews ?? standaloneFirestoreReviews).filter(
      (r) => r.facilityId === facility.id
    );

    for (const r of firestoreList) {
      const ts = toTimestampMs(r.updatedAt) || toTimestampMs(r.createdAt);
      const key = `${r.facilityId}_${r.userId}`;
      byUserKey.set(key, {
        id: r.id,
        facilityId: r.facilityId,
        facilityName: r.facilityName,
        userId: r.userId,
        authorName: r.authorName,
        rating: r.rating,
        comment: r.comment,
        timestampMs: ts,
        dateLabel: formatDateLabel(ts),
      });
    }

    for (const r of apiRatings) {
      if (r.facilityId !== facility.id) continue;
      const ts = toTimestampMs(r.updatedAt) || toTimestampMs(r.createdAt);
      const key = `${r.facilityId}_${r.userUid}`;
      const existing = byUserKey.get(key);
      if (existing) {
        byUserKey.set(key, {
          ...existing,
          dbId: r.id,
          ...(ts > existing.timestampMs
            ? {
                rating: r.rating,
                comment: r.comment,
                authorName: r.authorName,
                timestampMs: ts,
                dateLabel: formatDateLabel(ts),
              }
            : {}),
        });
      } else {
        byUserKey.set(key, {
          id: `rev_f${r.facilityId}_${r.userUid}`,
          dbId: r.id,
          facilityId: r.facilityId,
          facilityName: r.facilityName,
          userId: r.userUid,
          authorName: r.authorName,
          rating: r.rating,
          comment: r.comment,
          timestampMs: ts,
          dateLabel: formatDateLabel(ts),
        });
      }
    }

    const list = Array.from(byUserKey.values());
    if (reviewSort === 'highest') {
      return list.sort((a, b) => b.rating - a.rating || b.timestampMs - a.timestampMs);
    }
    if (reviewSort === 'lowest') {
      return list.sort((a, b) => a.rating - b.rating || b.timestampMs - a.timestampMs);
    }
    return list.sort((a, b) => b.timestampMs - a.timestampMs);
  }, [externalReviews, standaloneFirestoreReviews, apiRatings, facility.id, reviewSort]);

  const myExistingReview = useMemo(() => {
    if (!firebaseUser) return null;
    return mergedReviews.find((r) => r.userId === firebaseUser.uid) || null;
  }, [mergedReviews, firebaseUser]);

  useEffect(() => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (myExistingReview) {
      setRatingInput(myExistingReview.rating);
      setCommentInput(myExistingReview.comment);
    } else {
      setRatingInput(5);
      setCommentInput('');
    }
  }, [facility.id, myExistingReview?.id]);

  const averageRating = useMemo(() => {
    if (mergedReviews.length === 0) return 0;
    const sum = mergedReviews.reduce((acc, r) => acc + r.rating, 0);
    return sum / mergedReviews.length;
  }, [mergedReviews]);

  const starDistribution = useMemo(() => {
    const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const r of mergedReviews) {
      const bucket = Math.max(1, Math.min(5, Math.round(r.rating)));
      counts[bucket] += 1;
    }
    return counts;
  }, [mergedReviews]);

  const activeStarValue = hoverRating || ratingInput;
  const isLoading = externalLoading !== undefined ? externalLoading : internalLoading;

  const handleStarKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentStar: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      setRatingInput(Math.min(5, currentStar + 1));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      setRatingInput(Math.max(1, currentStar - 1));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !facility.verified) return;

    const trimmedComment = commentInput.trim();
    if (trimmedComment.length < 3) {
      setErrorMsg('Please enter at least 3 characters describing your experience.');
      return;
    }
    if (trimmedComment.length > 600) {
      setErrorMsg('Reviews must be 600 characters or fewer.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const authorName = dbUser?.fullName || firebaseUser.displayName || 'Community Member';

    try {
      const [apiOutcome, firestoreOutcome] = await Promise.allSettled([
        apiFetch<ApiFacilityRating>(
          `/api/facilities/${facility.id}/ratings`,
          {
            method: 'POST',
            body: JSON.stringify({
              rating: ratingInput,
              comment: trimmedComment,
            }),
          },
          true
        ),
        saveFacilityReview({
          facilityId: facility.id,
          facilityName: facility.name,
          userId: firebaseUser.uid,
          authorName,
          rating: ratingInput,
          comment: trimmedComment,
        }),
      ]);

      if (apiOutcome.status === 'rejected' && firestoreOutcome.status === 'rejected') {
        const reason =
          (apiOutcome.reason as Error)?.message ||
          (firestoreOutcome.reason as Error)?.message ||
          'Unable to save your review. Please try again.';
        setErrorMsg(reason);
        return;
      }

      if (apiOutcome.status === 'fulfilled') {
        const saved = apiOutcome.value;
        setApiRatings((prev) => {
          const rest = prev.filter((item) => item.userUid !== saved.userUid);
          return [saved, ...rest];
        });
      }

      if (externalReviews === undefined) {
        const fresh = await fetchPublicFacilityReviews().catch(() => null);
        if (fresh) {
          setStandaloneFirestoreReviews(fresh.filter((r) => r.facilityId === facility.id));
        }
      }

      setSuccessMsg(
        myExistingReview
          ? 'Your rating and review have been updated.'
          : 'Thank you. Your rating and review are now live.'
      );

      onRatingSaved?.();

      void pushNotification({
        title: `Review Posted — ${facility.name}`,
        message: `You rated ${facility.name} ${ratingInput}/5 stars.`,
        category: 'facility',
      }).catch(() => {});
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to save your review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (review: NormalizedReview) => {
    setDeletingId(review.id);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const tasks: Promise<unknown>[] = [deleteFacilityReview(review.id)];
      if (review.dbId) {
        tasks.push(
          apiFetch(
            `/api/facilities/${facility.id}/ratings/${review.dbId}`,
            { method: 'DELETE' },
            true
          )
        );
      }

      const outcomes = await Promise.allSettled(tasks);
      const anySucceeded = outcomes.some((o) => o.status === 'fulfilled');
      if (!anySucceeded) {
        const firstErr = outcomes.find((o): o is PromiseRejectedResult => o.status === 'rejected');
        throw firstErr?.reason || new Error('Unable to delete review.');
      }

      if (review.dbId) {
        setApiRatings((prev) => prev.filter((item) => item.id !== review.dbId));
      }
      if (externalReviews === undefined) {
        setStandaloneFirestoreReviews((prev) => prev.filter((item) => item.id !== review.id));
      }

      setSuccessMsg('Your review has been removed.');
      onRatingSaved?.();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to remove review.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section
      aria-label={`Ratings and reviews for ${facility.name}`}
      className="p-6 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-6"
    >
      {/* Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-sky-900/50">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-sky-50 truncate">
              Community Ratings &amp; Reviews — {facility.name}
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-sky-200/70 mt-1">
            {facility.city}, {facility.state}
            <span aria-hidden="true"> · </span>
            {facility.facilityType.replace('_', ' ')}
            <span aria-hidden="true"> · </span>
            {facility.verified ? 'Verified Collection Centre' : 'Pending Verification'}
          </p>
        </div>

        {facility.verified && mergedReviews.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <label
              htmlFor={`rating-sort-${facility.id}`}
              className="text-xs text-slate-500 dark:text-sky-200/70 whitespace-nowrap"
            >
              Sort by
            </label>
            <select
              id={`rating-sort-${facility.id}`}
              value={reviewSort}
              onChange={(e) => setReviewSort(e.target.value as 'newest' | 'highest' | 'lowest')}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-sky-800 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <option value="newest">Newest First</option>
              <option value="highest">Highest Rated</option>
              <option value="lowest">Lowest Rated</option>
            </select>
          </div>
        )}
      </div>

      {!facility.verified ? (
        <div className="p-4 rounded-lg border border-amber-300/70 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-semibold">
              Ratings and reviews are enabled for verified collection facilities.
            </p>
            <p className="mt-0.5 opacity-85">
              Select a verified green-pinned centre from the map or directory to read or submit community feedback.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Aggregate Score + Distribution + Submission Form */}
          <div className="lg:col-span-5 space-y-6">
            {/* Summary Histogram */}
            <div className="flex items-center gap-5">
              <div className="text-center pr-5 border-r border-slate-200 dark:border-sky-900/60 shrink-0">
                <p className="text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50">
                  {mergedReviews.length > 0 ? averageRating.toFixed(1) : '—'}
                </p>
                <div className="flex items-center justify-center gap-0.5 mt-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-3.5 h-3.5 ${
                        star <= Math.round(averageRating)
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-slate-300 dark:text-sky-900'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-sky-200/65 mt-1">
                  {mergedReviews.length} review{mergedReviews.length === 1 ? '' : 's'}
                </p>
              </div>

              <div className="flex-1 space-y-1.5">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = starDistribution[star] || 0;
                  const pct =
                    mergedReviews.length > 0 ? Math.round((count / mergedReviews.length) * 100) : 0;
                  return (
                    <div
                      key={star}
                      className="flex items-center gap-2 text-xs font-mono tabular-nums"
                    >
                      <span className="w-5 text-slate-600 dark:text-sky-200/75">{star}★</span>
                      <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-sky-950 overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full transition-all duration-200"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-6 text-right text-slate-500 dark:text-sky-200/60">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rating Submission Form / Sign-In Prompt */}
            {firebaseUser ? (
              <form
                onSubmit={handleSubmit}
                className="pt-5 border-t border-slate-200 dark:border-sky-900/50 space-y-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-sky-50">
                    {myExistingReview ? 'Update Your Review' : 'Write a Review'}
                  </span>
                  <span className="text-xs font-mono tabular-nums text-amber-600 dark:text-amber-400 font-semibold">
                    {activeStarValue} / 5 · {RATING_LABELS[activeStarValue]}
                  </span>
                </div>

                <div
                  className="flex items-center gap-1"
                  role="radiogroup"
                  aria-label="Select star rating from 1 to 5"
                >
                  {[1, 2, 3, 4, 5].map((star) => {
                    const active = star <= activeStarValue;
                    const checked = star === ratingInput;
                    return (
                      <button
                        key={star}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        aria-label={`${star} star${star === 1 ? '' : 's'} — ${RATING_LABELS[star]}`}
                        onClick={() => setRatingInput(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        onKeyDown={(e) => handleStarKeyDown(e, star)}
                        className="p-1.5 rounded-lg hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 transition-transform"
                      >
                        <Star
                          className={`w-6 h-6 transition-colors ${
                            active
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-300 dark:text-sky-800'
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>

                <div>
                  <label
                    htmlFor={`facility-review-comment-${facility.id}`}
                    className="sr-only"
                  >
                    Your review of {facility.name}
                  </label>
                  <textarea
                    id={`facility-review-comment-${facility.id}`}
                    rows={3}
                    required
                    minLength={3}
                    maxLength={600}
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    placeholder="Share your experience with drop-off speed, staff support, weighing transparency, or receipt handling..."
                    className="w-full px-3.5 py-2.5 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50 placeholder:text-slate-400 dark:placeholder:text-sky-200/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  />
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-sky-200/55 mt-1.5">
                    <span>Published under your display name</span>
                    <span className="font-mono tabular-nums">{commentInput.length}/600</span>
                  </div>
                </div>

                {errorMsg && (
                  <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                    {errorMsg}
                  </p>
                )}
                {successMsg && (
                  <p role="status" className="text-xs text-sky-700 dark:text-sky-400 font-medium">
                    {successMsg}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full px-4 py-2.5 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-sky-700 dark:hover:bg-sky-400 disabled:opacity-60 inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {myExistingReview ? 'Update Review' : 'Submit Review'}
                </button>
              </form>
            ) : (
              <div className="pt-5 border-t border-slate-200 dark:border-sky-900/50 space-y-3">
                <p className="text-xs text-slate-600 dark:text-sky-200/75 leading-relaxed">
                  Sign in with your account to submit a 5-star rating and review for this collection facility.
                </p>
                <GoogleSignInButton
                  onClick={() => void signInWithGoogle()}
                  loading={signingIn}
                  label="Sign in to Rate Facility"
                />
              </div>
            )}
          </div>

          {/* Right Column: Community Reviews Feed */}
          <div className="lg:col-span-7">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2].map((skeleton) => (
                  <div
                    key={skeleton}
                    className="py-4 border-b border-slate-200 dark:border-sky-900/50 animate-pulse space-y-2"
                  >
                    <div className="h-3.5 w-36 rounded bg-slate-200 dark:bg-sky-900/60" />
                    <div className="h-3 w-full rounded bg-slate-100 dark:bg-sky-950/80" />
                    <div className="h-3 w-4/5 rounded bg-slate-100 dark:bg-sky-950/80" />
                  </div>
                ))}
              </div>
            ) : mergedReviews.length === 0 ? (
              <div className="py-10 px-6 rounded-xl border border-dashed border-slate-300 dark:border-sky-900/70 text-center space-y-1.5">
                <p className="text-sm font-medium text-slate-900 dark:text-sky-50">
                  No reviews yet for {facility.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-sky-200/65 max-w-md mx-auto">
                  Be the first community member to rate this collection facility and help others plan their e-waste drop-off.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-sky-900/50 max-h-[380px] overflow-y-auto pr-1">
                {mergedReviews.map((rev) => {
                  const isOwn = firebaseUser?.uid === rev.userId;
                  const canDelete = Boolean(
                    firebaseUser && (isOwn || dbUser?.role === 'admin')
                  );

                  return (
                    <article key={rev.id} className="py-4 first:pt-0 last:pb-0 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                            <span className="font-semibold text-slate-900 dark:text-sky-50">
                              {rev.authorName}
                            </span>
                            {isOwn && (
                              <span className="text-sky-700 dark:text-sky-400 font-medium">
                                You
                              </span>
                            )}
                            <span className="text-slate-400 dark:text-sky-200/40" aria-hidden="true">
                              ·
                            </span>
                            <span className="font-mono tabular-nums text-slate-500 dark:text-sky-200/60">
                              {rev.dateLabel}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 mt-1">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`w-3.5 h-3.5 ${
                                  s <= rev.rating
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-slate-300 dark:text-sky-900'
                                }`}
                              />
                            ))}
                            <span className="ml-1.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-sky-200/65">
                              {rev.rating}.0
                            </span>
                          </div>
                        </div>

                        {canDelete && (
                          <button
                            type="button"
                            disabled={deletingId === rev.id}
                            onClick={() => void handleDelete(rev)}
                            aria-label="Delete review"
                            title="Delete review"
                            className="p-2 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors shrink-0"
                          >
                            {deletingId === rev.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>

                      <p className="text-xs text-slate-700 dark:text-sky-100/85 leading-relaxed whitespace-pre-line">
                        {rev.comment}
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default FacilityRating;
