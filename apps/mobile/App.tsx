import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

type FilterTab = 'All' | 'Unwatched' | 'Favorites';

const FILTER_TABS: FilterTab[] = ['All', 'Unwatched', 'Favorites'];

const TAB_CARDS: Record<FilterTab, Array<{ step: string; title: string; detail: string; tag: string }>> = {
  All: [
    {
      step: '1',
      title: 'Scan or enter the barcode',
      detail: 'Quick-match physical packaging via UPC/EAN.',
      tag: 'Intake',
    },
    {
      step: '2',
      title: 'Enrich live movie metadata',
      detail: 'Pull title, original title, release year, and synopsis.',
      tag: 'Metadata',
    },
    {
      step: '3',
      title: 'Capture front & back cover art',
      detail: 'Store high-res edition artwork directly in your catalog.',
      tag: 'Covers',
    },
    {
      step: '4',
      title: 'Tag physical edition & packaging',
      detail: 'Record format, region, Steelbook/Slipcover, and shelf.',
      tag: 'Edition',
    },
  ],
  Unwatched: [
    {
      step: '1',
      title: 'Verify watched status on intake',
      detail: 'New editions default to unwatched so they stay queued for movie night.',
      tag: 'Queue',
    },
    {
      step: '2',
      title: 'Record shelf & collection name',
      detail: 'Pinpoint exact room or shelf location to pull discs quickly.',
      tag: 'Storage',
    },
    {
      step: '3',
      title: 'Log watched date after screening',
      detail: 'Mark movies watched in the web editor to update your backlog count.',
      tag: 'History',
    },
  ],
  Favorites: [
    {
      step: '1',
      title: 'Star standout films',
      detail: 'Toggle Favorite in the movie details form to highlight top picks.',
      tag: 'Curated',
    },
    {
      step: '2',
      title: 'Document collector packaging',
      detail: 'Track Steelbooks, Slipcovers, Digibooks, booklets, and included posters.',
      tag: 'Collector',
    },
    {
      step: '3',
      title: 'Track edition value & condition',
      detail: 'Save purchase price, estimated value, and condition notes.',
      tag: 'Valuation',
    },
  ],
};

export default function App() {
  const [activeTab, setActiveTab] = useState<FilterTab>('All');
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});

  const filterSummary: Record<FilterTab, string> = {
    All: 'Showing complete catalog intake workflow and edition tools.',
    Unwatched: 'Focus on physical editions waiting on your watchlist.',
    Favorites: 'Quick access to your starred favorite physical editions.',
  };

  const activeCards = TAB_CARDS[activeTab];
  const completedCount = activeCards.filter((item) => completedSteps[`${activeTab}-${item.step}`]).length;
  const totalCount = activeCards.length;

  const toggleStep = (stepKey: string) => {
    setCompletedSteps((prev) => ({
      ...prev,
      [stepKey]: !prev[stepKey],
    }));
  };

  const resetActiveTabSteps = () => {
    setCompletedSteps((prev) => {
      const next = { ...prev };
      for (const item of activeCards) {
        delete next[`${activeTab}-${item.step}`];
      }
      return next;
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Film Collection
          </Text>
          <Text style={styles.subtitle}>
            Physical media catalog &amp; barcode intake
          </Text>
        </View>

        <View style={styles.tabRow} accessibilityRole="tablist" accessibilityLabel="Catalog filter">
          {FILTER_TABS.map((tab) => {
            const selected = activeTab === tab;
            return (
              <Pressable
                key={tab}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setActiveTab(tab)}
                style={({ pressed }) => [
                  styles.pill,
                  selected && styles.pillSelected,
                  pressed && styles.pillPressed,
                ]}
              >
                <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
                  {tab}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.bannerCard} accessibilityLiveRegion="polite">
          <Text style={styles.bannerTitle}>{activeTab} view</Text>
          <Text style={styles.bannerBody}>{filterSummary[activeTab]}</Text>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {activeTab === 'All' ? 'Intake workflow' : `${activeTab} checklist`}
          </Text>
          <View style={styles.progressGroup}>
            <Text style={styles.progressText} accessibilityLiveRegion="polite">
              {completedCount} of {totalCount} completed
            </Text>
            {completedCount > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Reset ${activeTab} checklist`}
                onPress={resetActiveTabSteps}
                style={({ pressed }) => [styles.resetButton, pressed && styles.pillPressed]}
              >
                <Text style={styles.resetButtonText}>Reset</Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: totalCount, now: completedCount }}>
          <View style={[styles.progressFill, { width: `${totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0}%` }]} />
        </View>

        {totalCount > 0 && completedCount === totalCount && (
          <View style={styles.completionBanner} accessibilityLiveRegion="polite">
            <Text style={styles.completionBannerText}>All steps complete — ready to save to your catalog.</Text>
          </View>
        )}

        <View style={styles.cardList}>
          {activeCards.map((item) => {
            const stepKey = `${activeTab}-${item.step}`;
            const checked = Boolean(completedSteps[stepKey]);
            return (
              <Pressable
                key={stepKey}
                onPress={() => toggleStep(stepKey)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                accessibilityLabel={`${item.step}. ${item.title} (${item.tag}): ${item.detail}`}
                style={({ pressed }) => [
                  styles.glassCard,
                  checked && styles.glassCardChecked,
                  pressed && styles.pillPressed,
                ]}
              >
                <View style={[styles.stepBadge, checked && styles.stepBadgeChecked]}>
                  <Text style={[styles.stepBadgeText, checked && styles.stepBadgeTextChecked]}>
                    {checked ? '✓' : item.step}
                  </Text>
                </View>
                <View style={styles.cardContent}>
                  <View style={styles.cardTitleRow}>
                    <Text style={[styles.cardTitle, checked && styles.cardTitleChecked]}>{item.title}</Text>
                    <Text style={styles.tagText}>{item.tag}</Text>
                  </View>
                  <Text style={styles.cardDetail}>{item.detail}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0c1628',
  },
  container: {
    padding: 20,
    paddingBottom: 36,
    gap: 18,
  },
  header: {
    gap: 4,
    paddingTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#edf4ff',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(237, 244, 255, 0.72)',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pill: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(138, 180, 255, 0.28)',
    backgroundColor: 'rgba(18, 28, 46, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  pillSelected: {
    backgroundColor: 'rgba(138, 180, 255, 0.18)',
    borderColor: '#8ab4ff',
  },
  pillPressed: {
    opacity: 0.8,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(237, 244, 255, 0.78)',
  },
  pillTextSelected: {
    color: '#8ab4ff',
    fontWeight: '700',
  },
  bannerCard: {
    backgroundColor: 'rgba(18, 28, 46, 0.9)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(138, 180, 255, 0.2)',
    gap: 4,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#8ab4ff',
  },
  bannerBody: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(237, 244, 255, 0.82)',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#edf4ff',
  },
  progressGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8ab4ff',
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#66bb6a',
  },
  completionBanner: {
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(102, 187, 106, 0.45)',
    backgroundColor: 'rgba(102, 187, 106, 0.14)',
  },
  completionBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#a5d6a7',
  },
  resetButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(138, 180, 255, 0.35)',
    backgroundColor: 'rgba(138, 180, 255, 0.12)',
    justifyContent: 'center',
  },
  resetButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8ab4ff',
  },
  cardList: {
    gap: 12,
  },
  glassCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: 'rgba(18, 28, 46, 0.9)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  glassCardChecked: {
    borderColor: 'rgba(102, 187, 106, 0.55)',
    backgroundColor: 'rgba(22, 40, 56, 0.92)',
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(138, 180, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeChecked: {
    backgroundColor: 'rgba(102, 187, 106, 0.22)',
  },
  stepBadgeText: {
    color: '#8ab4ff',
    fontWeight: '800',
    fontSize: 15,
  },
  stepBadgeTextChecked: {
    color: '#81c784',
  },
  cardContent: {
    flex: 1,
    gap: 4,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#edf4ff',
  },
  cardTitleChecked: {
    color: 'rgba(237, 244, 255, 0.85)',
  },
  tagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8ab4ff',
    backgroundColor: 'rgba(138, 180, 255, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  cardDetail: {
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(237, 244, 255, 0.72)',
  },
});
