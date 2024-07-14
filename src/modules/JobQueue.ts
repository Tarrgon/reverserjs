import Job from "./Job"

function sortedIndex<T>(array: Job<T>[], value: Job<T>): number {
  let low = 0,
      high = array.length

  while (low < high) {
      let mid = (low + high) >>> 1
      if (array[mid].priority < value.priority || array[mid].retryNumber < value.retryNumber) {
        high = mid
      }
      else if (array[mid].lastAttemptDate && value.lastAttemptDate) {
        if ((array[mid].lastAttemptDate as Date) < value.lastAttemptDate) low = mid + 1
        else high = mid
      }
      else {
        if (array[mid].creationDate < value.creationDate) low = mid + 1
        else high = mid
      }
  }
  
  return low
}

class JobQueue<T> {
  queue: Job<T>[] = []

  get length() {
    return this.queue.length
  }

  addJob(job: Job<T>) {
    let index = sortedIndex(this.queue, job)
    this.queue.splice(index, 0, job)
  }

  hasMoreJobs(): boolean {
    return this.queue.length > 0
  }

  pop(): Job<T> {
    return this.queue.shift() as Job<T>
  }

  popFirst(total: number): Job<T>[] {
    return this.queue.splice(0, total)
  }

  removeAt(index: number) {
    this.queue.splice(index, 1)
  }

  findIndex(needle: (value: Job<T>, index?: number, obj?: Job<T>[]) => boolean): number {
    return this.queue.findIndex(needle)
  }
}

export default JobQueue