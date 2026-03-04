interface SortableItem {
  updatedAt?: string | Date;
  createdAt?: string | Date;
  isPinned?: boolean;
}

export interface SectionBlock<T = SortableItem> {
  label: string;
  items: T[];
  icon?: React.ReactNode;
}

interface SectionBlockSelector {
  label: string;
  icon?: React.ReactNode;
  selector: false | ((item: SortableItem, date: Date) => boolean);
}

export function sortItemsBySections<T extends SortableItem>(
  items: T[],
  selectors: SectionBlockSelector[] = []
): SectionBlock<T>[] {
  // sort conversations by last activity
  const sortedItems = [...items];
  sortedItems.sort((a, b) => {
    const aDate = a.updatedAt || a.createdAt;
    const bDate = b.updatedAt || b.createdAt;

    if (aDate === undefined) {
      return 1;
    }
    if (bDate === undefined) {
      return -1;
    }
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  });

  if (selectors.length === 0) {
    return [
      {
        label: "All Chats",
        items: sortedItems,
      },
    ];
  }

  const result: SectionBlock<T>[] = selectors.map(({ label, icon }) => ({ label, items: [], icon }));
  const defaultSectionNnx = selectors.findIndex(section => section.selector === false);
  const defaultSection = defaultSectionNnx !== -1 ? result[defaultSectionNnx] : null;

  sortedItems.forEach(item => {
    const date = item.updatedAt || item.createdAt;
    if (!date) {
      return;
    }

    for (let ndx = 0; ndx < selectors.length; ndx++) {
      const section = selectors[ndx];
      if (section.selector && section.selector(item, new Date(date))) {
        result[ndx].items.push(item);
        return;
      }
    }

    if (defaultSection) {
      defaultSection.items.push(item);
    }
  });

  return result.filter(block => block.items.length > 0);
}
