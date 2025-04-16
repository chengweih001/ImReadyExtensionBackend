import app, { Component } from 'apprun';

const ENTER = 13

const state = {
  filter: 0,
  todos: []
}

const keyup = e => {
  const input = e.target;
  if (e.keyCode === ENTER && input.value) {
    add();
    input.value = '';
  }
};

const keyupJoin = e => {
  const input = e.target;
  if (e.keyCode === ENTER && input.value) {
    join();
    input.value = '';
  }
};

const add = () => {
  app.run('//ws:', '@create-activity', {
    name: (document.getElementById('new_todo') as HTMLInputElement).value,
    userId: 'fakeid'
  })
};

const join = () => {
  app.run('//ws:', '@join-activity', {
    activityId: (document.getElementById('join_activity_id') as HTMLInputElement).value,
    userId: (document.getElementById('join_user_id') as HTMLInputElement).value,
  })
};

const start = () => {
  app.run('//ws:', '@start-activity', {
    activityId: (document.getElementById('join_activity_id') as HTMLInputElement).value,
    userId: (document.getElementById('join_user_id') as HTMLInputElement).value,
  })
};

const leave = () => {
  app.run('//ws:', '@leave-activity', {
    activityId: (document.getElementById('join_activity_id') as HTMLInputElement).value,
    userId: (document.getElementById('join_user_id') as HTMLInputElement).value,
  })
};

const toggle = (_, todo) => { app.run('//ws:', '@update-todo', { ...todo, done: !todo.done }) };

const remove = (_, todo) => { app.run('//ws:', '@delete-activity', todo) };

const clear = () => { app.run('//ws:', '@delete-all-activity') };

const search = (state, filter) => ({ ...state, filter });

const Todo = ({todo}) => <li>
  <input type="checkbox" checked={todo.done} $onclick={[toggle, todo]}></input>
  <span style={{color: todo.done ? 'green' : 'red'}}>
<<<<<<< HEAD
    {todo.name} <a href='#' $onclick={[remove, todo]}>&#9249;</a></span>
  <span>({todo.id})</span>
=======
    {todo.title} <a href='#' $onclick={[remove, todo]}>&#9249;</a></span>
  <span>({todo.ip})</span>
>>>>>>> a7b052c598b9a346a141f96fbecb8f356942aa06
</li>;

const view = (state) => {
  const styles = (filter) => ({
    'font-weight': state.filter === filter ? 'bold' : 'normal',
    cursor: 'pointer'
  })
  return <div>
    <h1>Todo</h1>
    <div>
      <span>Show:</span>
      <span> <a style={styles(0)} $onclick={[search, 0]}>All</a></span> |
      <span> <a style={styles(1)} $onclick={[search, 1]}>Todo</a></span> |
      <span> <a style={styles(2)} $onclick={[search, 2]}>Done</a></span>
    </div>
    <ul>
      {
        state.todos
          .filter(todo => state.filter === 0 ||
            (state.filter === 1 && !todo.done) ||
            (state.filter === 2 && todo.done) )
          .map((todo) => <Todo todo={todo} />)
      }
    </ul>
    <div>
      <input placeholder='add todo' onkeyup={keyup} id="new_todo"/>
      <button $onclick={[add]}>Add</button>
      <button $onclick={[clear]}>Clear All</button>
    </div>      
    <div>    
      <input placeholder='activity id' onkeyup={keyupJoin} id="join_activity_id"/>
      <input placeholder='user id' onkeyup={keyupJoin} id="join_user_id"/>
      <button $onclick={[join]}>Join</button>
      <button $onclick={[leave]}>Leave</button>
      <button $onclick={[start]}>Start</button>
    </div>
  </div>
}

const update = {
  '@get-all-activity': (state, todos) => ({ ...state, todos }),  
  '@create-activity': (state, todo) => ({
    ...state, todos: [...state.todos, todo], filter:0
  }),  
  '@delete-all-activity': state => ({ ...state, todos: [] }),  
  
  '@get-all-todo': (state, todos) => ({ ...state, todos }),

  '@create-todo': (state, todo) => ({
    ...state, todos: [...state.todos, todo], filter:0
  }),

  '@update-todo': (state, todo) => {
    const idx = state.todos.findIndex(i => i.id === todo.id);
    if (idx < 0) app.run('//ws:', '@get-all-activity');
    else return ({
      ...state,
      todos: [
        ...state.todos.slice(0, idx),
        todo,
        ...state.todos.slice(idx + 1)
      ]
    });
  },

  '@delete-todo': (state, todo) => {
    const idx = state.todos.findIndex(i => i.id === todo.id);
    if (idx < 0) app.run('//ws:', '@get-all-todo');
    else return ({
      ...state,
      todos: [
        ...state.todos.slice(0, idx),
        ...state.todos.slice(idx + 1)
      ]
    });
  },

  '@delete-all-todo': state => ({ ...state, todos: [] })
}

export default new Component(state, view, update);
