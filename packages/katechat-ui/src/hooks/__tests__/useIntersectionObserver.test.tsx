import { renderHook, act } from "@testing-library/react";
import { useIntersectionObserver } from "../useIntersectionObserver";

// jsdom has no IntersectionObserver; emulate the browser contract the hook
// relies on — a new observer immediately reports the current intersection
// state of an observed target, then reports transitions.
let mockVisible = false;

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  private target: Element | null = null;

  constructor(private cb: IntersectionObserverCallback) {
    MockIntersectionObserver.instances.push(this);
  }

  observe(el: Element) {
    this.target = el;
    this.emit(mockVisible);
  }

  disconnect() {
    this.target = null;
  }

  emit(isIntersecting: boolean) {
    if (!this.target) return;
    this.cb([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }

  static get last(): MockIntersectionObserver {
    return MockIntersectionObserver.instances[MockIntersectionObserver.instances.length - 1];
  }
}

beforeEach(() => {
  jest.useFakeTimers();
  mockVisible = false;
  MockIntersectionObserver.instances = [];
  (globalThis as Record<string, unknown>).IntersectionObserver = MockIntersectionObserver;
});

afterEach(() => {
  jest.useRealTimers();
});

const setup = (callback: () => void) => {
  const rendered = renderHook(({ cb }) => useIntersectionObserver<HTMLDivElement>(cb, [cb], 100), {
    initialProps: { cb: callback },
  });
  rendered.result.current.current = document.createElement("div");
  // deps identity changes on rerender, so the observer is rebuilt and picks up
  // the ref target — same as in real consumers re-rendering on state changes
  rendered.rerender({ cb: callback });
  act(() => {
    jest.advanceTimersByTime(100);
  });
  return rendered;
};

describe("useIntersectionObserver", () => {
  it("fires when the target enters the viewport", () => {
    const callback = jest.fn();
    setup(callback);

    expect(callback).not.toHaveBeenCalled();

    act(() => MockIntersectionObserver.last.emit(true));
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not re-fire when the observer is re-created while the target stays visible", () => {
    mockVisible = true;
    const callback = jest.fn();
    const { rerender } = setup(callback);

    // initial report of the visible target
    expect(callback).toHaveBeenCalledTimes(1);

    // consumer re-renders (e.g. a messages page was prepended): the observer
    // is torn down and re-created, immediately reporting the still-visible
    // target — this must NOT trigger another load
    mockVisible = true;
    rerender({ cb: callback });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("fires again after the target leaves and re-enters the viewport", () => {
    mockVisible = true;
    const callback = jest.fn();
    setup(callback);
    expect(callback).toHaveBeenCalledTimes(1);

    act(() => {
      MockIntersectionObserver.last.emit(false);
      MockIntersectionObserver.last.emit(true);
    });

    expect(callback).toHaveBeenCalledTimes(2);
  });
});
