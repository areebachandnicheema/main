<?php

class TodoApp {
    private $filename = "tasks.json";
    private $tasks = [];
    private $nextId = 1;

    public function __construct() {
        $this->loadFromFile();
    }

    public function displayMenu() {
        echo "\n===== TO-DO LIST APPLICATION =====\n";
        echo "1. Add Task\n";
        echo "2. View All Tasks\n";
        echo "3. View Active Tasks\n";
        echo "4. View Completed Tasks\n";
        echo "5. Mark Task as Complete\n";
        echo "6. Edit Task\n";
        echo "7. Delete Task\n";
        echo "8. Clear Completed Tasks\n";
        echo "9. Show Statistics\n";
        echo "10. Exit\n";
        echo "==================================\n";
    }

    public function addTask() {
        echo "Enter task description: ";
        $text = trim(fgets(STDIN));

        if (empty($text)) {
            echo "Task cannot be empty!\n";
            return;
        }

        $task = [
            "id" => $this->nextId++,
            "text" => $text,
            "completed" => false,
            "created_at" => date("Y-m-d H:i:s")
        ];

        $this->tasks[] = $task;
        $this->saveToFile();
        echo "Task added successfully!\n";
    }

    public function viewAllTasks() {
        if (empty($this->tasks)) {
            echo "\nNo tasks found!\n";
            return;
        }

        echo "\n===== ALL TASKS =====\n";
        $this->displayTasks($this->tasks);
    }

    public function viewActiveTasks() {
        $activeTasks = array_filter($this->tasks, function($task) {
            return !$task["completed"];
        });

        if (empty($activeTasks)) {
            echo "\nNo active tasks!\n";
            return;
        }

        echo "\n===== ACTIVE TASKS =====\n";
        $this->displayTasks($activeTasks);
    }

    public function viewCompletedTasks() {
        $completedTasks = array_filter($this->tasks, function($task) {
            return $task["completed"];
        });

        if (empty($completedTasks)) {
            echo "\nNo completed tasks!\n";
            return;
        }

        echo "\n===== COMPLETED TASKS =====\n";
        $this->displayTasks($completedTasks);
    }

    public function markTaskComplete() {
        if (empty($this->tasks)) {
            echo "\nNo tasks to mark!\n";
            return;
        }

        $this->viewAllTasks();

        echo "Enter task ID to mark as complete: ";
        $taskId = intval(trim(fgets(STDIN)));

        foreach ($this->tasks as &$task) {
            if ($task["id"] === $taskId) {
                $task["completed"] = true;
                $this->saveToFile();
                echo "Task marked as complete!\n";
                return;
            }
        }

        echo "Task not found!\n";
    }

    public function editTask() {
        if (empty($this->tasks)) {
            echo "\nNo tasks to edit!\n";
            return;
        }

        $this->viewAllTasks();

        echo "Enter task ID to edit: ";
        $taskId = intval(trim(fgets(STDIN)));

        foreach ($this->tasks as &$task) {
            if ($task["id"] === $taskId) {
                echo "Enter new task description: ";
                $newText = trim(fgets(STDIN));

                if (!empty($newText)) {
                    $task["text"] = $newText;
                    $this->saveToFile();
                    echo "Task updated successfully!\n";
                }
                return;
            }
        }

        echo "Task not found!\n";
    }

    public function deleteTask() {
        if (empty($this->tasks)) {
            echo "\nNo tasks to delete!\n";
            return;
        }

        $this->viewAllTasks();

        echo "Enter task ID to delete: ";
        $taskId = intval(trim(fgets(STDIN)));

        foreach ($this->tasks as $index => $task) {
            if ($task["id"] === $taskId) {
                unset($this->tasks[$index]);
                $this->tasks = array_values($this->tasks);
                $this->saveToFile();
                echo "Task deleted successfully!\n";
                return;
            }
        }

        echo "Task not found!\n";
    }

    public function clearCompleted() {
        $this->tasks = array_filter($this->tasks, function($task) {
            return !$task["completed"];
        });
        $this->tasks = array_values($this->tasks);
        $this->saveToFile();
        echo "Completed tasks cleared!\n";
    }

    public function showStatistics() {
        $total = count($this->tasks);
        $completed = count(array_filter($this->tasks, function($task) {
            return $task["completed"];
        }));
        $active = $total - $completed;

        echo "\n===== STATISTICS =====\n";
        echo "Total Tasks: " . $total . "\n";
        echo "Active Tasks: " . $active . "\n";
        echo "Completed Tasks: " . $completed . "\n";

        if ($total > 0) {
            $completionRate = ($completed / $total) * 100;
            printf("Completion Rate: %.1f%%\n", $completionRate);
        }
    }

    public function run() {
        while (true) {
            $this->displayMenu();

            echo "Enter your choice: ";
            $choice = intval(trim(fgets(STDIN)));

            switch ($choice) {
                case 1:
                    $this->addTask();
                    break;
                case 2:
                    $this->viewAllTasks();
                    break;
                case 3:
                    $this->viewActiveTasks();
                    break;
                case 4:
                    $this->viewCompletedTasks();
                    break;
                case 5:
                    $this->markTaskComplete();
                    break;
                case 6:
                    $this->editTask();
                    break;
                case 7:
                    $this->deleteTask();
                    break;
                case 8:
                    $this->clearCompleted();
                    break;
                case 9:
                    $this->showStatistics();
                    break;
                case 10:
                    echo "Goodbye!\n";
                    return;
                default:
                    echo "Invalid choice! Please try again.\n";
            }
        }
    }

    private function displayTasks($taskList) {
        foreach ($taskList as $task) {
            $status = $task["completed"] ? "[X]" : "[ ]";
            echo "[" . $task["id"] . "] " . $status . " " . $task["text"] . "\n";
        }
    }

    private function saveToFile() {
        try {
            $jsonData = json_encode($this->tasks, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
            file_put_contents($this->filename, $jsonData);
        } catch (Exception $e) {
            echo "Error saving tasks: " . $e->getMessage() . "\n";
        }
    }

    private function loadFromFile() {
        try {
            if (file_exists($this->filename)) {
                $jsonData = file_get_contents($this->filename);
                $this->tasks = json_decode($jsonData, true);

                if (!is_array($this->tasks)) {
                    $this->tasks = [];
                } elseif (!empty($this->tasks)) {
                    $maxId = max(array_column($this->tasks, "id"));
                    $this->nextId = $maxId + 1;
                }
            }
        } catch (Exception $e) {
            echo "Error loading tasks: " . $e->getMessage() . "\n";
            $this->tasks = [];
        }
    }
}

// Run the application
if (php_sapi_name() === 'cli') {
    $app = new TodoApp();
    $app->run();
} else {
    echo "This application must be run from the command line (CLI)\n";
}
?>